import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { formatIDR, formatPct } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { Flash } from "@/components/flash";
import { createReport } from "./actions";

type Totals = { occupancy_pct: number | null; room_revenue: number; net_profit: number };
type Report = { id: string; period_type: string; period_start: string; period_end: string; ai_summary: string | null; metrics: { current: { totals: Totals } } };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await getCurrentOrg();
  const { data } = await supabase.from("reports")
    .select("id, period_type, period_start, period_end, ai_summary, metrics")
    .is("property_id", null).order("period_start", { ascending: false }).limit(60);
  const reports = (data ?? []) as Report[];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Laporan</h1>
          <p className="text-sm text-stone-500">Dibuat otomatis: mingguan setiap Senin, bulanan setiap tanggal 1.</p>
        </div>
        <div className="flex gap-2">
          <form action={createReport.bind(null, "weekly")}><button className="btn-secondary">Buat laporan minggu lalu</button></form>
          <form action={createReport.bind(null, "monthly")}><button className="btn-secondary">Buat laporan bulan lalu</button></form>
        </div>
      </div>
      <Flash error={sp.error} />

      <div className="card overflow-x-auto p-0">
        {reports.length === 0 ? (
          <p className="p-5 text-sm text-stone-500">Belum ada laporan.</p>
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr><th className="px-4 py-2">Periode</th><th>Jenis</th><th className="text-right">Okupansi</th><th className="text-right">Pendapatan kamar</th><th className="text-right">Laba bersih</th><th className="px-4">AI</th></tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const t = r.metrics.current.totals;
                return (
                  <tr key={r.id} className="border-t border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-2"><Link href={`/reports/${r.id}`} className="font-medium text-emerald-800 hover:underline">{formatDate(r.period_start)} – {formatDate(r.period_end)}</Link></td>
                    <td>{r.period_type === "weekly" ? "Mingguan" : r.period_type === "monthly" ? "Bulanan" : r.period_type}</td>
                    <td className="text-right">{formatPct(t.occupancy_pct)}</td>
                    <td className="text-right">{formatIDR(t.room_revenue, true)}</td>
                    <td className="text-right">{formatIDR(t.net_profit, true)}</td>
                    <td className="px-4 text-stone-500">{r.ai_summary ? "✓ ringkasan" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
