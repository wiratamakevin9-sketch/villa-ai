import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { formatIDR, formatMonth, formatPct } from "@/lib/format";
import { TrendCharts, type TrendPoint } from "@/components/trend-charts";

type KpiRow = {
  property_id: string;
  property_name: string;
  month: string;
  available_nights: number;
  occupied_nights: number;
  occupancy_pct: number | null;
  room_revenue: number;
  commission: number;
  other_income: number;
  expenses: number;
  adr: number | null;
  revpar: number | null;
  net_profit: number;
};

type ForwardRow = { property_name: string; horizon_days: number; occupancy_pct: number };

function monthStart(offset = 0) {
  const d = new Date();
  const m = new Date(Date.UTC(d.getFullYear(), d.getMonth() + offset, 1));
  return m.toISOString().slice(0, 10);
}

function sum(rows: KpiRow[], key: keyof KpiRow) {
  return rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);
}

function totals(rows: KpiRow[]) {
  const available = sum(rows, "available_nights");
  const occupied = sum(rows, "occupied_nights");
  const revenue = sum(rows, "room_revenue");
  return {
    occupancy: available ? Math.round((1000 * occupied) / available) / 10 : null,
    revenue,
    adr: occupied ? revenue / occupied : 0,
    profit: sum(rows, "net_profit"),
  };
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase } = await getCurrentOrg();
  const thisMonth = monthStart(0);
  const lastMonth = monthStart(-1);

  const firstTrendMonth = monthStart(-11);
  const [{ data: kpi }, { data: forward }, { data: shared }, { data: trendRows }, { data: trendShared }] = await Promise.all([
    supabase.from("v_monthly_kpi").select("*").in("month", [thisMonth, lastMonth]).order("property_name"),
    supabase.from("v_forward_occupancy").select("property_name, horizon_days, occupancy_pct").order("property_name"),
    supabase.from("v_monthly_shared_expenses").select("month, shared_expenses").in("month", [thisMonth, lastMonth]),
    supabase.from("v_monthly_kpi").select("*").gte("month", firstTrendMonth).lte("month", thisMonth),
    supabase.from("v_monthly_shared_expenses").select("month, shared_expenses").gte("month", firstTrendMonth).lte("month", thisMonth),
  ]);

  const rows = (kpi ?? []) as KpiRow[];
  const current = rows.filter((r) => r.month === thisMonth);
  const previous = rows.filter((r) => r.month === lastMonth);

  if (current.length === 0) {
    return (
      <div className="card max-w-lg">
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <h1 className="text-lg font-semibold">Belum ada villa</h1>
        <p className="mt-1 text-sm text-stone-500">
          Tambahkan villa pertama kamu, atau muat data contoh dari menu Pengaturan.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/properties" className="btn">Tambah villa</Link>
          <Link href="/settings" className="btn-secondary">Pengaturan</Link>
        </div>
      </div>
    );
  }

  const now = totals(current);
  const prev = totals(previous);
  const sharedFor = (m: string) => Number(shared?.find((s) => s.month === m)?.shared_expenses ?? 0);
  const sharedExpenses = sharedFor(thisMonth);

  // Data tren 12 bulan (hanya bulan yang punya data villa)
  const trend: TrendPoint[] = Array.from({ length: 12 }, (_, i) => monthStart(i - 11))
    .map((m) => {
      const r = ((trendRows ?? []) as KpiRow[]).filter((x) => x.month === m);
      if (r.length === 0) return null;
      const t = totals(r);
      const sh = Number(trendShared?.find((x) => x.month === m)?.shared_expenses ?? 0);
      return {
        month: m,
        label: new Date(m + "T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
        revenue: Math.round(t.revenue),
        profit: Math.round(t.profit - sh),
        occupancy: t.occupancy,
      };
    })
    .filter((x): x is TrendPoint => x !== null);

  const cards = [
    { label: "Okupansi", value: formatPct(now.occupancy), prev: formatPct(prev.occupancy) },
    { label: "Pendapatan kamar", value: formatIDR(now.revenue, true), prev: formatIDR(prev.revenue, true) },
    { label: "ADR (rata-rata/malam)", value: formatIDR(now.adr, true), prev: formatIDR(prev.adr, true) },
    {
      label: "Laba bersih*",
      value: formatIDR(now.profit - sharedExpenses, true),
      prev: formatIDR(prev.profit - sharedFor(lastMonth), true),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ringkasan {formatMonth(thisMonth)}</h1>
        <p className="text-sm text-stone-500">Bulan berjalan, semua villa. Pembanding: bulan lalu.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-stone-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold">{c.value}</p>
            <p className="mt-1 text-xs text-stone-400">Bulan lalu: {c.prev}</p>
          </div>
        ))}
      </div>

      {trend.length > 1 && <TrendCharts data={trend} />}

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Per villa — bulan ini</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="py-2">Villa</th>
              <th>Okupansi</th>
              <th>Malam terisi</th>
              <th>ADR</th>
              <th>RevPAR</th>
              <th>Pendapatan</th>
              <th>Pengeluaran</th>
              <th>Laba</th>
            </tr>
          </thead>
          <tbody>
            {current.map((r) => (
              <tr key={r.property_id} className="border-t border-stone-100">
                <td className="py-2 font-medium">{r.property_name}</td>
                <td>{formatPct(r.occupancy_pct)}</td>
                <td>{r.occupied_nights}/{r.available_nights}</td>
                <td>{formatIDR(r.adr, true)}</td>
                <td>{formatIDR(r.revpar, true)}</td>
                <td>{formatIDR(r.room_revenue, true)}</td>
                <td>{formatIDR(Number(r.expenses) + Number(r.commission), true)}</td>
                <td className="font-medium">{formatIDR(r.net_profit, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-stone-400">
          *Laba bersih total sudah dikurangi biaya bersama semua villa ({formatIDR(sharedExpenses, true)}).
          Pengeluaran per villa termasuk komisi OTA. Pengeluaran bulan berjalan belum lengkap.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">Okupansi ke depan (sudah dipesan)</h2>
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="py-2">Villa</th><th>30 hari</th><th>60 hari</th><th>90 hari</th></tr>
          </thead>
          <tbody>
            {Object.entries(
              ((forward ?? []) as ForwardRow[]).reduce<Record<string, Record<number, number>>>((acc, f) => {
                (acc[f.property_name] ??= {})[f.horizon_days] = f.occupancy_pct;
                return acc;
              }, {}),
            ).map(([name, h]) => (
              <tr key={name} className="border-t border-stone-100">
                <td className="py-2 font-medium">{name}</td>
                {[30, 60, 90].map((d) => (
                  <td key={d} className={h[d] < 50 ? "text-amber-700" : ""}>{formatPct(h[d])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-stone-400">Kuning = di bawah 50%, perlu strategi promosi.</p>
      </div>
    </div>
  );
}
