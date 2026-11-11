import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { runAgent, type AgentEvent } from "@/lib/agent/run";

export const runtime = "nodejs";
export const maxDuration = 300; // analisis + web search bisa butuh beberapa menit

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Harus login" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY belum diisi di .env.local (atau Environment Variables di Vercel)." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as { message?: string; conversationId?: string | null } | null;
  const message = body?.message?.trim();
  if (!message) return Response.json({ error: "Pesan kosong" }, { status: 400 });
  if (message.length > 4000) return Response.json({ error: "Pesan terlalu panjang (maks 4.000 karakter)" }, { status: 400 });

  const { data: membership } = await supabase
    .from("memberships").select("org_id, role, organizations(name)").eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  if (!membership) return Response.json({ error: "Belum punya bisnis" }, { status: 400 });
  if (membership.role === "staff") return Response.json({ error: "Asisten AI hanya untuk owner/manager" }, { status: 403 });
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();

  // Stream NDJSON: satu event JSON per baris
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent({
          supabase,
          orgId: membership.org_id,
          orgName: (membership.organizations as unknown as { name: string } | null)?.name ?? "Bisnis villa",
          userId: user.id,
          userName: profile?.full_name ?? null,
          conversationId: body?.conversationId ?? null,
          userMessage: message,
          emit,
        });
      } catch (err) {
        console.error("[agent]", err);
        let msg = "Terjadi kesalahan. Coba lagi.";
        if (err instanceof Anthropic.AuthenticationError) msg = "API key Anthropic tidak valid.";
        else if (err instanceof Anthropic.RateLimitError) msg = "Terlalu banyak permintaan ke AI. Tunggu sebentar lalu coba lagi.";
        else if (err instanceof Anthropic.APIError) msg = `Layanan AI error (${err.status ?? "koneksi"}). Coba lagi.`;
        emit({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform" },
  });
}
