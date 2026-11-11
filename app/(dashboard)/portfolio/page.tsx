import Link from "next/link";
import { requireManager } from "@/lib/org";
import { formatIDR, formatPct } from "@/lib/format";
import { ForecastChart, type ForecastPoint } from "@/components/forecast-chart";

type Kpi = { property_id: string; property_name: string; month: string; available_nights: number; occupied_nights: number; room_revenue: number; commission: number; other_income: number; expenses: number; net_profit: number };
type Ch = { property_id: string; channel_name: string; channel_type: string; gross_revenue: number };
type Fc = { property_id: string; property_name: string; month: string; available_nights: number; otb_nights: number; otb_revenue: number; pickup_nights: number; forecast_nights: number; forecast_occupancy_pct: number; forecast_adr: number; forecast_revenue: number; forecast_profit: number; confidence: string; history_occupancy_pct: number; booked_ahead_share_pct: number };

const CONF: Record<string, string> = { tinggi: "●●● tinggi", sedang: "●●○ sedang", rendah: "●○○ rendah" };
const monthLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "2-digit" });

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const sp = await searchParams;
  const months = [3, 6, 12].includes(Number(sp.months)) ? Number(sp.months) : 6;
  const { supabase, org } = await requireManager();
  const now = new Date();
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth() - months, 1)).toISOString().slice(0, 10);

  const [{ data: kpi }, { data: ch }, { data: sh }, { data: props }, { data: fc }] = await Promise.all([
    supabase.from("v_monthly_kpi").select("property_id, property_name, month, available_nights, occupied_nights, room_revenue, commission, other_income, expenses, net_profit").gte("month", start).lt("month", end),
    supabase.from("v_channel_performance").select("property_id, channel_name, channel_type, gross_revenue").gte("month", start).lt("month", end),
    supabase.from("v_monthly_shared_expenses").select("shared_expenses").gte("month", start).lt("month", end),
    supabase.from("properties").select("id, purchase_price").eq("status", "active"),
    supabase.rpc("forecast_revenue", { p_org: org.id, p_months: 3 }),
  ]);
  const rows = (kpi ?? []) as Kpi[];
  const villas = [...new Set(rows.map((r) => r.property_id))];
  const sharedTotal = (sh ?? []).reduce((a, r) => a + Number(r.shared_expenses), 0);
  const sharedPer = villas.length ? sharedTotal / villas.length : 0;
  const sum = (xs: Kpi[], k: keyof Kpi) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0);

  const per = villas.map((id) => {
    const r = rows.filter((x) => x.property_id === id);
    const avail = sum(r, "available_nights"), occ = sum(r, "occupied_nights"), rev = sum(r, "room_revenue");
    const profit = sum(r, "net_profit") - sharedPer;
    const income = rev + sum(r, "other_income");
    const invest = Number(props?.find((p) => p.id === id)?.purchase_price ?? 0);
    const monthsData = r.filter((x) => Number(x.available_nights) > 0).length;
    const chans = ((ch ?? []) as Ch[]).filter((c) => c.property_id === id);
    const chTotal = chans.reduce((a, c) => a + Number(c.gross_revenue), 0);
    const direct = chans.filter((c) => c.channel_type === "direct").reduce((a, c) => a + Number(c.gross_revenue), 0);
    return {
      id, name: r[0].property_name, avail, occ, rev, profit,
      occPct: avail ? (100 * occ) / avail : 0, adr: occ ? rev / occ : 0, revpar: avail ? rev / avail : 0,
      margin: income ? (100 * profit) / income : 0, profitPerNight: avail ? profit / avail : 0,
      roi: invest && monthsData ? (100 * (profit / monthsData) * 12) / invest : null,
      directShare: chTotal ? (100 * direct) / chTotal : 0,
    };
  }).sort((a, b) => b.revpar - a.revpar);
  const tot = { avail: per.reduce((a, p) => a + p.avail, 0), rev: per.reduce((a, p) => a + p.rev, 0), profit: per.reduce((a, p) => a + p.profit, 0), occ: per.reduce((a, p) => a + p.occ, 0) };
  const portRevpar = tot.avail ? tot.rev / tot.avail : 0;

  const forecast = (fc ?? []) as Fc[];
  const fMonths = [...new Set(forecast.map((f) => f.month))].sort();
  const chart: ForecastPoint[] = fMonths.map((m) => {
    const xs = forecast.filter((f) => f.month === m);
    const otb = xs.reduce((a, f) => a + Number(f.otb_revenue), 0);
    return { label: monthLabel(m), otb, pickup: xs.reduce((a, f) => a + Number(f.forecast_revenue), 0) - otb };
  });

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Portofolio</h1>
          <p className="text-sm text-stone-500">Perbandingan semua villa · {months} bulan penuh terakhir</p>
        </div>
        <div className="flex gap-1 text-sm">
          {[3, 6, 12].map((m) => (
            <Link key={m} href={`/portfolio?months=${m}`} className={m === months ? "btn px-3 py-1" : "btn-secondary px-3 py-1"}>{m} bln</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4"><p className="text-sm text-stone-500">Okupansi portofolio</p><p className="text-xl font-semibold">{formatPct(tot.avail ? Math.round((1000 * tot.occ) / tot.avail) / 10 : null)}</p></div>
        <div className="card p-4"><p className="text-sm text-stone-500">RevPAR portofolio</p><p className="text-xl font-semibold">{formatIDR(portRevpar, true)}</p></div>
        <div className="card p-4"><p className="text-sm text-stone-500">Pendapatan kamar</p><p className="text-xl font-semibold">{formatIDR(tot.rev, true)}</p></div>
        <div className="card p-4"><p className="text-sm text-stone-500">Laba bersih (setelah biaya bersama)</p><p className="text-xl font-semibold">{formatIDR(tot.profit, true)}</p></div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-1 font-semibold">Peringkat villa</h2>
        <p className="mb-3 text-xs text-stone-500">Diurutkan menurut RevPAR. <b>Indeks RevPAR</b> = RevPAR villa ÷ RevPAR portofolio (100 = rata-rata). Biaya bersama dibagi rata ke villa.</p>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-stone-500">
            <tr><th className="py-1">Villa</th><th className="text-right">Okupansi</th><th className="text-right">ADR</th><th className="text-right">RevPAR</th><th className="text-right">Indeks</th>
              <th className="text-right">Pendapatan</th><th className="text-right">Laba</th><th className="text-right">Margin</th><th className="text-right">Laba/malam</th><th className="text-right">ROI/thn</th><th className="text-right">Direct</th></tr>
          </thead>
          <tbody>
            {per.map((p, i) => (
              <tr key={p.id} className="border-t border-stone-100">
                <td className="py-1.5 font-medium">{i + 1}. {p.name}</td>
                <td className="text-right">{formatPct(Math.round(p.occPct * 10) / 10)}</td>
                <td className="text-right">{formatIDR(p.adr, true)}</td>
                <td className="text-right">{formatIDR(p.revpar, true)}</td>
                <td className={`text-right font-medium ${p.revpar >= portRevpar ? "text-emerald-700" : "text-amber-700"}`}>{portRevpar ? Math.round((100 * p.revpar) / portRevpar) : "–"}</td>
                <td className="text-right">{formatIDR(p.rev, true)}</td>
                <td className="text-right">{formatIDR(p.profit, true)}</td>
                <td className="text-right">{formatPct(Math.round(p.margin))}</td>
                <td className="text-right">{formatIDR(p.profitPerNight, true)}</td>
                <td className="text-right">{p.roi === null ? "–" : formatPct(Math.round(p.roi * 10) / 10)}</td>
                <td className="text-right">{formatPct(Math.round(p.directShare))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-stone-500"><b>Direct</b> = porsi pendapatan dari booking langsung/WhatsApp (tanpa komisi OTA). ROI/thn = laba bulanan rata-rata × 12 ÷ nilai investasi.</p>
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="font-semibold">Forecast 3 bulan ke depan</h2>
          <p className="text-sm text-stone-500">Pendapatan kamar semua villa: <b>sudah dipesan</b> + <b>perkiraan tambahan</b> dari pola pemesanan historis.</p>
        </div>
        <ForecastChart data={chart} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="py-1">Villa</th><th>Bulan</th><th className="text-right">Sudah dipesan</th><th className="text-right">+ Perkiraan</th><th className="text-right">Okupansi</th><th className="text-right">Pendapatan</th><th className="text-right">Laba</th><th>Keyakinan</th></tr>
            </thead>
            <tbody>
              {forecast.map((f) => (
                <tr key={f.property_id + f.month} className="border-t border-stone-100">
                  <td className="py-1">{f.property_name}</td>
                  <td>{monthLabel(f.month)}</td>
                  <td className="text-right">{f.otb_nights} mlm · {formatIDR(f.otb_revenue, true)}</td>
                  <td className="text-right">{f.pickup_nights} mlm</td>
                  <td className="text-right">{formatPct(f.forecast_occupancy_pct)}</td>
                  <td className="text-right">{formatIDR(f.forecast_revenue, true)}</td>
                  <td className="text-right font-medium">{formatIDR(f.forecast_profit, true)}</td>
                  <td className="whitespace-nowrap text-stone-600">{CONF[f.confidence]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="text-sm text-stone-600">
          <summary className="cursor-pointer">Cara forecast dihitung</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li><b>Sudah dipesan</b>: malam & pendapatan dari booking yang tercatat.</li>
            <li><b>Permintaan historis</b> = okupansi 180 hari terakhir × malam tersedia.</li>
            <li><b>Pola pemesanan</b>: dari booking 12 bulan terakhir, berapa persen malam yang biasanya sudah dipesan pada jarak hari yang sama.</li>
            <li><b>Pace</b>: jika booking masuk lebih cepat/lambat dari biasanya, perkiraan tambahan disesuaikan (0,5–1,5×).</li>
            <li>Malam tambahan dihargai dengan harga berlaku di <Link href="/pricing" className="underline">kalender harga</Link>; total dibatasi maks. 15% di atas permintaan historis.</li>
            <li>Pengeluaran = rata-rata 3 bulan terakhir (+ bagian biaya bersama).</li>
          </ol>
          <p className="mt-2">Keyakinan <b>rendah</b> berarti sebagian besar booking untuk bulan itu biasanya belum masuk — angka bisa berubah banyak. Forecast diperbarui otomatis setiap ada booking baru.</p>
        </details>
      </div>
    </div>
  );
}
