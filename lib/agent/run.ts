// =====================================================================
// Loop agent: Claude + tool data, dengan streaming ke UI.
// ---------------------------------------------------------------------
// Setiap pesan (pertanyaan user, jawaban Claude, hasil tool) disimpan
// ke tabel messages APA ADANYA dan dikirim ulang tanpa diubah pada
// giliran berikutnya (append-only) — wajib agar blok "thinking"
// model tetap valid.
// =====================================================================
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STABLE_SYSTEM_PROMPT, contextPrompt } from "./prompt";
import { TOOL_DEFINITIONS, TOOL_LABELS, WEB_SEARCH_TOOL, runTool } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

export type AgentEvent =
  | { type: "conversation"; id: string }
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "done" }
  | { type: "error"; message: string };

// Model bisa diganti lewat env, mis. ANTHROPIC_MODEL=claude-sonnet-5-5 untuk biaya lebih rendah.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high";
const MAX_STEPS = 10;

const TOOLS: Anthropic.Beta.Messages.BetaToolUnion[] = [...TOOL_DEFINITIONS, WEB_SEARCH_TOOL];

export async function runAgent(opts: {
  supabase: SupabaseClient;
  orgId: string;
  orgName: string;
  userId: string;
  userName: string | null;
  conversationId: string | null;
  userMessage: string;
  emit: (e: AgentEvent) => void;
}) {
  const { supabase, emit } = opts;
  const client = new Anthropic();

  // 1) Percakapan: lanjutkan atau buat baru
  let conversationId = opts.conversationId;
  if (!conversationId) {
    const { data, error } = await supabase.from("conversations")
      .insert({ org_id: opts.orgId, user_id: opts.userId, title: opts.userMessage.slice(0, 80) })
      .select("id").single();
    if (error) throw new Error(error.message);
    conversationId = data.id as string;
  }
  emit({ type: "conversation", id: conversationId });

  const { data: history, error: histErr } = await supabase.from("messages")
    .select("role, content").eq("conversation_id", conversationId).order("created_at").order("id");
  if (histErr) throw new Error(histErr.message);
  const messages: MessageParam[] = (history ?? []).map((m) => ({ role: m.role, content: m.content }));

  const save = async (msg: MessageParam) => {
    messages.push(msg);
    const { error } = await supabase.from("messages")
      .insert({ conversation_id: conversationId, role: msg.role, content: msg.content });
    if (error) throw new Error(error.message);
  };

  await save({ role: "user", content: [{ type: "text", text: opts.userMessage }] });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: STABLE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: contextPrompt({ orgName: opts.orgName, today, userName: opts.userName }) },
  ];

  // 2) Loop: Claude menjawab / memanggil tool sampai selesai
  let wroteText = false; // untuk memberi jarak paragraf antar langkah
  for (let step = 0; step < MAX_STEPS; step++) {
    let stepStarted = false;
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      system,
      tools: TOOLS,
      messages,
      output_config: { effort: EFFORT },
      cache_control: { type: "ephemeral" }, // cache otomatis riwayat percakapan
      // Jika model menolak karena filter keamanan, API otomatis mencoba model cadangan
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    stream.on("text", (delta) => {
      if (!stepStarted && wroteText) emit({ type: "text", delta: "\n\n" });
      stepStarted = true;
      wroteText = true;
      emit({ type: "text", delta });
    });
    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        emit({ type: "tool", name: event.content_block.name, label: TOOL_LABELS[event.content_block.name] ?? event.content_block.name });
      }
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      emit({ type: "text", delta: "\n\n_Maaf, permintaan ini tidak dapat diproses. Coba ajukan pertanyaan dengan cara lain._" });
      break; // giliran yang ditolak tidak disimpan
    }

    await save({ role: "assistant", content: message.content });

    if (message.stop_reason === "pause_turn") continue; // web search panjang: lanjutkan
    if (message.stop_reason === "max_tokens") {
      emit({ type: "text", delta: "\n\n_Jawaban terpotong karena terlalu panjang. Minta lanjutkan atau persempit pertanyaan._" });
      break;
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use",
    );
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

    // Jalankan semua tool (paralel) dan kirim hasilnya dalam SATU pesan
    for (const t of toolUses) emit({ type: "tool", name: t.name, label: TOOL_LABELS[t.name] ?? t.name });
    const results = await Promise.all(toolUses.map(async (t) => {
      const r = await runTool(supabase, t.name, t.input);
      return { type: "tool_result" as const, tool_use_id: t.id, content: r.content, is_error: r.isError };
    }));
    await save({ role: "user", content: results });

    if (step === MAX_STEPS - 1) {
      emit({ type: "text", delta: "\n\n_Analisis dihentikan karena terlalu banyak langkah. Coba persempit pertanyaan._" });
    }
  }

  await supabase.from("audit_log").insert({
    org_id: opts.orgId, actor: opts.userId, actor_type: "user", action: "ask_ai", entity: "conversation", entity_id: conversationId,
  });
  emit({ type: "done" });
}
