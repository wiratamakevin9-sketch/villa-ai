"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ChatTurn = { role: "user" | "assistant"; text: string; tools: string[] };

const SUGGESTIONS = [
  "Bagaimana performa bisnis 3 bulan terakhir dibanding sebelumnya?",
  "Villa mana yang paling menguntungkan, dan kenapa?",
  "Apakah ada pengeluaran yang tidak wajar? Apa penyebabnya?",
  "Okupansi 60 hari ke depan bagaimana? Apa yang harus saya lakukan?",
  "Channel mana yang paling menguntungkan setelah komisi?",
  "Riset harga sewa villa 3 kamar di Canggu untuk Desember, bandingkan dengan harga saya.",
];

export function Chat({ conversationId, initialTurns }: { conversationId: string | null; initialTurns: ChatTurn[] }) {
  const router = useRouter();
  const [turns, setTurns] = useState<ChatTurn[]>(initialTurns);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const convId = useRef<string | null>(conversationId);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { setTurns(initialTurns); convId.current = conversationId; }, [conversationId, initialTurns]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, status]);

  const patchLast = (fn: (t: ChatTurn) => ChatTurn) =>
    setTurns((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setError("");
    setInput("");
    setBusy(true);
    setStatus("Memahami pertanyaan…");
    setTurns((prev) => [...prev, { role: "user", text: message, tools: [] }, { role: "assistant", text: "", tools: [] }]);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId: convId.current }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Gagal (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isNew = !convId.current;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "conversation") {
            isNew = isNew && ev.id !== convId.current;
            convId.current = ev.id;
          } else if (ev.type === "text") {
            setStatus("");
            patchLast((t) => ({ ...t, text: t.text + ev.delta }));
          } else if (ev.type === "tool") {
            setStatus(`${ev.label}…`);
            patchLast((t) => (t.tools.includes(ev.label) ? t : { ...t, tools: [...t.tools, ev.label] }));
          } else if (ev.type === "error") {
            setError(ev.message);
          }
        }
      }
      if (isNew && convId.current) router.replace(`/assistant?c=${convId.current}`, { scroll: false });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex-1 space-y-4 pb-4">
        {turns.length === 0 && (
          <div className="card">
            <p className="font-medium">Tanyakan apa saja tentang bisnis villa kamu.</p>
            <p className="mb-4 text-sm text-stone-500">Asisten membaca data booking, keuangan, dan okupansi kamu, lalu menjelaskan temuan dan rekomendasi beserta alasannya.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-stone-200 p-3 text-left text-sm hover:border-emerald-600 hover:bg-emerald-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-emerald-700 px-4 py-2 text-sm text-white">{t.text}</div>
            </div>
          ) : (
            <div key={i} className="card max-w-full">
              {t.tools.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {t.tools.map((l) => (
                    <span key={l} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">✓ {l}</span>
                  ))}
                </div>
              )}
              {t.text ? (
                <div className="chat-md text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown></div>
              ) : (
                busy && i === turns.length - 1 && <p className="text-sm text-stone-500">{status || "Sedang berpikir…"}</p>
              )}
              {t.text && busy && i === turns.length - 1 && status && <p className="mt-2 text-xs text-stone-500">{status}</p>}
            </div>
          ),
        )}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div ref={bottom} />
      </div>

      <form
        className="sticky bottom-0 flex gap-2 border-t border-stone-200 bg-[var(--background)] py-3"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <textarea
          className="input min-h-11 flex-1 resize-none"
          rows={1}
          placeholder="Tulis pertanyaan… (Enter untuk kirim, Shift+Enter baris baru)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          disabled={busy}
          aria-label="Pertanyaan untuk asisten"
        />
        <button className="btn" disabled={busy || !input.trim()}>{busy ? "…" : "Kirim"}</button>
      </form>
    </div>
  );
}
