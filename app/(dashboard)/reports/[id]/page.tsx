import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { requireManager } from "@/lib/org";
import { aiEnabled } from "@/lib/agent/claude";
import { formatIDR, formatPct } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Flash } from "@/components/flash";
import { summarizeReport } from "../actions";
import { PrintButton } from "./print-button";

type Row = { property: string; occupancy_pct: number | null; occupied_nights: number; available_nights: number; adr: number | null; revpar: number | null; room_revenue: number; commission: number; expenses: number; net_profit: number };
type Totals = Row & { shared_expenses: number; other_income: number };
type Metrics = {
  current: { properties: Row[]; totals: Totals };
  previous: { totals: Totals };
  channels: { channel: string; nights: number; bookings: number; gross: number; commission: number }[];
  top_expenses: { category: string; amount: number }[];
  forward_occupancy: { property: string; horizon_days: number; occupancy_pct: number }[];
  open_alerts: number;
};

function Delta({ now, prev, kind }: { now: number | null; prev: number | null; kind: "pct" | "money" }) {
  if (now == null || prev == null || prev === 0) return null;
  const diff = kind === "pct" ? Math.round((now - prev) * 10) / 10 : Math.round((1000 * (now - prev)) / Math.abs(prev)) / 10;
  const up = diff >= 0;
  return (
    <span className={`text-xs ${up ? "text-emerald-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(diff).toLocaleString("id-ID")}{kind === "pct" ? " poin" : "%"} vs periode lalu
    </span>
  );
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org, role } = await requireManager();
  const { data: r } = await supabase.from("reports").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const m = r.metrics as Metrics;
  const c = m.current.totals, p = m.previous.totals;
  const fwd = Object.entries(m.forward_occupancy.reduce<Record<string, Record<number, number>>>((acc, f) => {
    (acc[f.property] ??= {})[f.horizon_days] = f.occupancy_pct; return acc;
  }, {}));

  const cards = [
    { label: "Okupansi", value: formatPct(c.occupancy_pct), delta: <Delta now={c.occupancy_pct} prev={p.occupancy_pct} kind="pct" /> },
    { label: "Pendapatan kamar", value: formatIDR(c.room_revenue, true), delta: <Delta now={c.room_revenue} prev={p.room_revenue} kind="money" /> },
    { label: "ADR", value: formatIDR(c.adr, true), delta: <Delta now={c.adr} prev={p.adr} kind="money" /> },
    { label: "Laba bersih", value: formatIDR(c.net_profit, true), delta: <Delta now={c.net_profit} prev={p.net_profit} kind="money" /> },
  ];

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/reports" className="text-sm text-emerald-700">‹ Semua laporan</Link>
        <PrintButton />
      </div>
      <div>
        <p className="text-sm text-stone-500">{org.name} · Laporan {r.period_type === "weekly" ? "mingguan" : "bulanan"}</p>
        <h1 className="text-2xl font-semibold">{formatDate(r.period_start)} – {formatDate(r.period_end)}</h1>
      </div>
      <Flash error={sp.error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((k) => (
          <div key={k.label} className="card p-4">
            <p className="text-sm text-stone-500">{k.label}</p>
            <p className="text-xl font-semibold">{k.value}</p>
            {k.delta}
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold">✦ Ringkasan &amp; rekomendasi AI</h2>
        {r.ai_summary ? (
          <div className="chat-md text-sm"><ReactMarkdown remarkPlugins={[remarkGfm]}>{r.ai_summary}</ReactMarkdown></div>
        ) : aiEnabled() && role !== "staff" ? (
          <form action={summarizeReport.bind(null, r.id)} className="print:hidden">
            <button className="btn">Buat ringkasan AI</button>
            <span className="ml-3 text-xs text-stone-500">±20–60 detik</span>
          </form>
        ) : (
          <p className="text-sm text-stone-500">Isi ANTHROPIC_API_KEY untuk ringkasan otomatis.</p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Per villa</h2>
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="py-1">Villa</th><th className="text-right">Okupansi</th><th className="text-right">Malam</th><th className="text-right">ADR</th><th className="text-right">RevPAR</th><th className="text-right">Pendapatan</th><th className="text-right">Komisi</th><th className="text-right">Pengeluaran</th><th className="text-right">Laba</th></tr>
          </thead>
          <tbody>
            {m.current.properties.map((v) => (
              <tr key={v.property} className="border-t border-stone-100">
                <td className="py-1 font-medium">{v.property}</td>
                <td className="text-right">{formatPct(v.occupancy_pct)}</td>
                <td className="text-right">{v.occupied_nights}/{v.available_nights}</td>
                <td className="text-right">{formatIDR(v.adr, true)}</td>
                <td className="text-right">{formatIDR(v.revpar, true)}</td>
                <td className="text-right">{formatIDR(v.room_revenue, true)}</td>
                <td className="text-right">{formatIDR(v.commission, true)}</td>
                <td className="text-right">{formatIDR(v.expenses, true)}</td>
                <td className="text-right font-medium">{formatIDR(v.net_profit, true)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-stone-200 text-stone-600">
              <td className="py-1">Biaya bersama</td><td colSpan={6}></td>
              <td className="text-right">{formatIDR(c.shared_expenses, true)}</td><td className="text-right">−{formatIDR(c.shared_expenses, true)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-1">Total</td><td className="text-right">{formatPct(c.occupancy_pct)}</td>
              <td className="text-right">{c.occupied_nights}/{c.available_nights}</td><td className="text-right">{formatIDR(c.adr, true)}</td>
              <td className="text-right">{formatIDR(c.revpar, true)}</td><td className="text-right">{formatIDR(c.room_revenue, true)}</td>
              <td className="text-right">{formatIDR(c.commission, true)}</td><td className="text-right">{formatIDR(Number(c.expenses) + Number(c.shared_expenses), true)}</td>
              <td className="text-right">{formatIDR(c.net_profit, true)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 font-semibold">Channel</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-stone-500"><tr><th className="py-1">Channel</th><th className="text-right">Malam</th><th className="text-right">Kotor</th><th className="text-right">Komisi</th></tr></thead>
            <tbody>
              {m.channels.map((ch) => (
                <tr key={ch.channel} className="border-t border-stone-100"><td className="py-1">{ch.channel}</td><td className="text-right">{ch.nights}</td><td className="text-right">{formatIDR(ch.gross, true)}</td><td className="text-right">{formatIDR(ch.commission, true)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="mb-2 font-semibold">Pengeluaran terbesar</h2>
          <table className="w-full text-sm">
            <tbody>
              {m.top_expenses.map((e) => (
                <tr key={e.category} className="border-t border-stone-100 first:border-0"><td className="py-1">{e.category}</td><td className="text-right">{formatIDR(e.amount, true)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Okupansi ke depan (saat laporan dibuat)</h2>
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-stone-500"><tr><th className="py-1">Villa</th><th className="text-right">30 hari</th><th className="text-right">60 hari</th><th className="text-right">90 hari</th></tr></thead>
          <tbody>
            {fwd.map(([name, h]) => (
              <tr key={name} className="border-t border-stone-100"><td className="py-1">{name}</td>{[30, 60, 90].map((d) => <td key={d} className="text-right">{formatPct(h[d])}</td>)}</tr>
            ))}
          </tbody>
        </table>
        {m.open_alerts > 0 && <p className="mt-2 text-sm text-stone-600">Ada {m.open_alerts} alert terbuka saat laporan dibuat. <Link href="/alerts" className="text-emerald-700 underline print:no-underline">Lihat alert</Link></p>}
      </div>
    </div>
  );
}
