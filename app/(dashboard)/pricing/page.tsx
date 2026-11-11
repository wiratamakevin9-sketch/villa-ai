import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { currentMonth, isValidMonth, monthRange } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { Flash } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { PricingTabs } from "./tabs";
import { applyRecommendations, clearRates, recompute, setRates } from "./actions";

type Day = {
  date: string; base_rate: number; season_name: string | null; season_multiplier: number; override_rate: number | null;
  effective_rate: number; min_stay: number; is_blocked: boolean; is_booked: boolean;
  recommended_rate: number | null; change_pct: number | null; factors: Factors | null;
};
type Factors = {
  season?: { name: string; multiplier: number }; weekend?: boolean; nearby_occupancy_pct?: number; demand_adj?: number;
  last_minute_adj?: number; forward_30d_occupancy_pct?: number; history_90d_occupancy_pct?: number; history_adj?: number;
  competitor_median?: number; clamped?: "min" | "max";
};

const jt = (n: number | null) => (n == null ? "–" : `${(Number(n) / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 2 })} jt`);
const pct = (x: number) => `${x > 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 100)}%`;

/** Alasan rekomendasi dalam bahasa sehari-hari */
function reasons(f: Factors | null): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.season) out.push(`${f.season.name} (×${f.season.multiplier})`);
  if (f.weekend) out.push("Akhir pekan +10%");
  if (f.demand_adj) out.push(`Permintaan tinggi di sekitar tanggal (${f.nearby_occupancy_pct}% terisi) ${pct(f.demand_adj)}`);
  if (f.last_minute_adj) out.push(`Last-minute, okupansi 30 hari ${f.forward_30d_occupancy_pct}% ${pct(f.last_minute_adj)}`);
  if (f.history_adj) out.push(`Okupansi 90 hari ${f.history_90d_occupancy_pct}% ${pct(f.history_adj)}`);
  if (f.competitor_median) out.push(`Median kompetitor ${jt(f.competitor_median)}`);
  if (f.clamped) out.push(f.clamped === "min" ? "Dibatasi harga minimum" : "Dibatasi harga maksimum");
  return out;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; month?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, role } = await getCurrentOrg();
  const { properties } = await getLookups(supabase);
  if (properties.length === 0) return <p className="text-sm text-stone-500">Tambahkan villa terlebih dahulu.</p>;
  const property = properties.find((p) => p.id === sp.property)?.id ?? properties[0].id;
  const month = isValidMonth(sp.month) ? sp.month : currentMonth();
  const { start, end } = monthRange(month);
  const lastDay = new Date(Date.parse(end) - 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: cal }, { data: upcoming }, { data: prop }] = await Promise.all([
    supabase.rpc("rate_calendar_view", { p_property: property, p_from: start, p_to: lastDay }),
    supabase.rpc("rate_calendar_view", { p_property: property, p_from: today, p_to: in30 }),
    supabase.from("properties").select("base_rate, min_rate, max_rate").eq("id", property).single(),
  ]);
  const days = (cal ?? []) as Day[];
  const recs = ((upcoming ?? []) as Day[]).filter((d) => d.recommended_rate != null && Math.abs(Number(d.change_pct)) >= 5);
  const canEdit = role !== "staff";
  const firstDow = (new Date(start + "T00:00:00").getDay() + 6) % 7; // Senin = 0

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Harga</h1>
      <PricingTabs active="calendar" property={property} />
      <Flash error={sp.error} message={sp.message} />

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="property" defaultValue={property} className="input w-auto">
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-secondary">Pilih</button>
        </form>
        <MonthNav month={month} basePath="/pricing" params={{ property }} />
        {canEdit && <form action={recompute.bind(null, property, month)}><button className="btn-secondary">Hitung ulang rekomendasi</button></form>}
      </div>
      <p className="text-sm text-stone-500">
        Harga dasar {formatIDR(prop?.base_rate)} · batas {formatIDR(prop?.min_rate ?? Number(prop?.base_rate) * 0.6, true)}–{formatIDR(prop?.max_rate ?? Number(prop?.base_rate) * 2, true)}
        <span className="mx-1">·</span><Link href={`/properties/${property}`} className="text-emerald-700 underline">ubah</Link>
      </p>

      {/* Kalender bulan */}
      <div className="card overflow-x-auto p-3">
        <div className="grid min-w-[700px] grid-cols-7 gap-1 text-xs">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d} className="px-1 pb-1 font-medium text-stone-500">{d}</div>)}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {days.map((d) => {
            const diff = d.recommended_rate != null && Math.abs(Number(d.change_pct)) >= 5;
            return (
              <div key={d.date}
                className={`min-h-20 rounded-md border p-1.5 ${d.is_booked ? "border-stone-200 bg-stone-100 text-stone-500" : "border-stone-200 bg-white"} ${d.date === today ? "ring-2 ring-emerald-600" : ""}`}
                title={reasons(d.factors).join(" · ")}>
                <div className="flex justify-between">
                  <span className="font-medium">{Number(d.date.slice(8))}</span>
                  {d.is_booked ? <span>terisi</span> : d.is_blocked ? <span>blokir</span> : d.season_name ? <span className="truncate pl-1 text-stone-400">{d.season_name}</span> : null}
                </div>
                <div className={`mt-1 text-sm ${d.override_rate ? "font-semibold" : ""}`}>{jt(d.effective_rate)}{d.override_rate ? " *" : ""}</div>
                {diff && (
                  <div className={Number(d.change_pct) > 0 ? "text-emerald-700" : "text-amber-700"}>
                    {Number(d.change_pct) > 0 ? "▲" : "▼"} {jt(d.recommended_rate)}
                  </div>
                )}
                {d.min_stay > 1 && <div className="text-stone-400">min {d.min_stay} mlm</div>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Angka utama = harga berlaku. <b>*</b> = harga khusus. ▲/▼ = rekomendasi sistem (berbeda ≥5%). Abu-abu = sudah dipesan.
          Arahkan kursor ke tanggal untuk melihat alasannya.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Rekomendasi 30 hari */}
        <div className="card min-w-0">
          <h2 className="font-semibold">Rekomendasi 30 hari ke depan ({recs.length})</h2>
          <p className="mb-3 text-sm text-stone-500">Tanggal kosong dengan rekomendasi berbeda ≥5% dari harga berlaku. Dihitung ulang setiap pagi.</p>
          {recs.length === 0 ? <p className="text-sm text-stone-500">Harga saat ini sudah sesuai rekomendasi.</p> : (
            <form action={applyRecommendations.bind(null, property, month)}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-left text-stone-500">
                    <tr><th className="py-1"></th><th>Tanggal</th><th className="text-right">Sekarang</th><th className="text-right">Rekomendasi</th><th>Alasan</th></tr>
                  </thead>
                  <tbody>
                    {recs.map((d) => (
                      <tr key={d.date} className="border-t border-stone-100 align-top">
                        <td className="py-1.5">{canEdit && <input type="checkbox" name="date" value={d.date} defaultChecked={Math.abs(Number(d.change_pct)) >= 10} aria-label={`Terapkan ${d.date}`} />}</td>
                        <td className="whitespace-nowrap">{new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}</td>
                        <td className="text-right">{jt(d.effective_rate)}</td>
                        <td className={`whitespace-nowrap text-right font-medium ${Number(d.change_pct) > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                          {jt(d.recommended_rate)} ({Number(d.change_pct) > 0 ? "+" : ""}{Number(d.change_pct).toLocaleString("id-ID")}%)
                        </td>
                        <td className="text-xs text-stone-600">{reasons(d.factors).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && <button className="btn mt-3">Terapkan yang dicentang</button>}
            </form>
          )}
        </div>

        {/* Atur harga manual */}
        {canEdit && (
          <div className="card h-fit space-y-3">
            <h2 className="font-semibold">Atur harga tanggal</h2>
            <form action={setRates.bind(null, property, month)} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="r-from">Dari</label><input id="r-from" name="date_from" type="date" className="input" required defaultValue={today} /></div>
                <div><label className="label" htmlFor="r-to">Sampai</label><input id="r-to" name="date_to" type="date" className="input" required defaultValue={today} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="r-rate">Harga/malam (Rp)</label><input id="r-rate" name="rate" inputMode="numeric" className="input" required /></div>
                <div><label className="label" htmlFor="r-min">Min. malam</label><input id="r-min" name="min_stay" type="number" min={1} max={30} defaultValue={1} className="input" /></div>
              </div>
              <input name="reason" className="input" placeholder="Catatan (mis. promo Januari)" />
              <button className="btn w-full">Simpan harga</button>
            </form>
            <details className="text-sm">
              <summary className="cursor-pointer text-stone-600">Hapus harga khusus</summary>
              <form action={clearRates.bind(null, property, month)} className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input name="date_from" type="date" className="input" required defaultValue={start} aria-label="Dari" />
                  <input name="date_to" type="date" className="input" required defaultValue={lastDay} aria-label="Sampai" />
                </div>
                <button className="btn-secondary w-full">Kembalikan ke harga dasar × musim</button>
              </form>
            </details>
            <p className="text-xs text-amber-800">Harga di sini belum otomatis terkirim ke OTA. Perbarui juga di Airbnb / Booking.com / Agoda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
