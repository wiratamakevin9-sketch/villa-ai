// Klien Claude bersama + panggilan non-streaming singkat (penjelasan alert, ringkasan laporan).
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function complete(opts: {
  system: string;
  prompt: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<string> {
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { effort: opts.effort ?? "low" },
    // Jika model menolak karena filter keamanan, API otomatis mencoba model cadangan
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (res.stop_reason === "refusal") throw new Error("Permintaan ditolak oleh model.");
  return res.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export function friendlyAiError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return "API key Anthropic tidak valid.";
  if (err instanceof Anthropic.RateLimitError) return "Terlalu banyak permintaan ke AI. Coba lagi sebentar.";
  if (err instanceof Anthropic.APIError) return `Layanan AI error (${err.status ?? "koneksi"}).`;
  return err instanceof Error ? err.message : String(err);
}
