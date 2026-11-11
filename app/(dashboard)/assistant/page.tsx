import Link from "next/link";
import { requireManager } from "@/lib/org";
import { Chat, type ChatTurn } from "./chat";
import { deleteConversation } from "./actions";
import { TOOL_LABELS } from "@/lib/agent/tools";

type Block = { type: string; text?: string; name?: string };

// Ubah pesan API yang tersimpan menjadi giliran chat yang mudah dibaca
function toTurns(rows: { role: "user" | "assistant"; content: Block[] }[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of rows) {
    if (m.role === "user") {
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text) turns.push({ role: "user", text, tools: [] }); // pesan berisi hasil tool tidak ditampilkan
      continue;
    }
    let last = turns[turns.length - 1];
    if (!last || last.role !== "assistant") { last = { role: "assistant", text: "", tools: [] }; turns.push(last); }
    const texts = m.content.filter((b) => b.type === "text" && b.text).map((b) => b.text).join("");
    if (texts) last.text += (last.text ? "\n\n" : "") + texts;
    for (const b of m.content) {
      if ((b.type === "tool_use" || b.type === "server_tool_use") && b.name) {
        const label = TOOL_LABELS[b.name] ?? b.name;
        if (!last.tools.includes(label)) last.tools.push(label);
      }
    }
  }
  return turns;
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const { supabase, user } = await requireManager();

  const [{ data: conversations }, { data: rows }] = await Promise.all([
    supabase.from("conversations").select("id, title, created_at").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(30),
    c
      ? supabase.from("messages").select("role, content").eq("conversation_id", c).order("created_at").order("id")
      : Promise.resolve({ data: [] as { role: "user" | "assistant"; content: Block[] }[] }),
  ]);
  const turns = toTurns((rows ?? []) as { role: "user" | "assistant"; content: Block[] }[]);
  const aiReady = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Asisten AI</h1>
          {c && <Link href="/assistant" className="btn-secondary">+ Percakapan baru</Link>}
        </div>
        {!aiReady && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Asisten belum aktif: isi <code>ANTHROPIC_API_KEY</code> di <code>.env.local</code> lalu jalankan ulang aplikasi.
          </p>
        )}
        <Chat key={c ?? "new"} conversationId={c ?? null} initialTurns={turns} />
        <p className="mt-2 text-xs text-stone-400">
          AI bisa keliru. Angka diambil langsung dari database, tetapi periksa kembali sebelum mengambil keputusan penting.
        </p>
      </div>

      <aside className="space-y-2">
        <h2 className="text-sm font-semibold text-stone-500">Riwayat</h2>
        {(conversations ?? []).length === 0 && <p className="text-sm text-stone-400">Belum ada percakapan.</p>}
        <ul className="space-y-1">
          {(conversations ?? []).map((cv) => (
            <li key={cv.id} className={`group flex items-center gap-1 rounded-lg ${cv.id === c ? "bg-white shadow-sm" : "hover:bg-white"}`}>
              <Link href={`/assistant?c=${cv.id}`} className="flex-1 truncate px-3 py-2 text-sm" title={cv.title ?? ""}>
                {cv.title ?? "Percakapan"}
              </Link>
              <form action={deleteConversation.bind(null, cv.id)}>
                <button className="px-2 text-xs text-stone-300 hover:text-red-700" aria-label="Hapus percakapan">✕</button>
              </form>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
