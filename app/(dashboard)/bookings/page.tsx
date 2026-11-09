import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { currentMonth, formatDate, isValidMonth, monthRange } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { Flash } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { BookingTabs } from "./tabs";
import { STATUS_LABEL } from "./booking-form";

const STATUS_STYLE: Record<string, string> = {
  inquiry: "bg-stone-100 text-stone-600",
  confirmed: "bg-sky-50 text-sky-800",
  checked_in: "bg-emerald-50 text-emerald-800",
  completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-red-50 text-red-700 line-through",
  no_show: "bg-red-50 text-red-700",
};

type Row = {
  id: string; check_in: string; check_out: string; nights: number; status: string;
  gross_amount: number; commission_amount: number; net_amount: number; external_ref: string | null;
  guests: { name: string; country: string | null } | null;
  channels: { name: string } | null;
  properties: { name: string } | null;
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; property?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const month = isValidMonth(sp.month) ? sp.month : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase, role } = await getCurrentOrg();
  const { properties } = await getLookups(supabase);

  let q = supabase
    .from("bookings")
    .select("id, check_in, check_out, nights, status, gross_amount, commission_amount, net_amount, external_ref, guests(name, country), channels(name), properties(name)")
    .lt("check_in", end)
    .gt("check_out", start)
    .order("check_in");
  if (sp.property) q = q.eq("property_id", sp.property);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];
  const active = rows.filter((r) => !["cancelled", "no_show", "inquiry"].includes(r.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Booking</h1>
        {role !== "staff" && (
          <Link href={`/bookings/new${sp.property ? `?property=${sp.property}` : ""}`} className="btn">+ Tambah booking</Link>
        )}
      </div>
      <BookingTabs active="list" />
      <Flash error={sp.error} message={sp.message} />

      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} basePath="/bookings" params={{ property: sp.property }} />
        <form className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="property" defaultValue={sp.property ?? ""} className="input w-auto">
            <option value="">Semua villa</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm sm:max-w-xl">
        <div className="card p-3"><p className="text-stone-500">Booking aktif</p><p className="text-lg font-semibold">{active.length}</p></div>
        <div className="card p-3"><p className="text-stone-500">Nilai kotor</p><p className="text-lg font-semibold">{formatIDR(active.reduce((a, r) => a + Number(r.gross_amount), 0), true)}</p></div>
        <div className="card p-3"><p className="text-stone-500">Nilai bersih</p><p className="text-lg font-semibold">{formatIDR(active.reduce((a, r) => a + Number(r.net_amount), 0), true)}</p></div>
      </div>
      <p className="text-xs text-stone-500">Menampilkan booking yang menginap (sebagian atau penuh) di bulan ini. Nilai di atas adalah nilai penuh booking.</p>

      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-stone-500">Belum ada booking di bulan ini.</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-stone-50 text-left text-stone-500">
              <tr>
                <th className="px-4 py-2">Tamu</th><th>Villa</th><th>Tanggal</th><th>Malam</th>
                <th>Channel</th><th className="text-right">Kotor</th><th className="text-right">Bersih</th><th className="px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="px-4 py-2">
                    <Link href={`/bookings/${r.id}`} className="font-medium text-emerald-800 hover:underline">{r.guests?.name ?? "Tamu"}</Link>
                    {r.guests?.country && <span className="block text-xs text-stone-400">{r.guests.country}</span>}
                  </td>
                  <td>{r.properties?.name}</td>
                  <td className="whitespace-nowrap">{formatDate(r.check_in)} → {formatDate(r.check_out)}</td>
                  <td>{r.nights}</td>
                  <td>{r.channels?.name ?? "—"}</td>
                  <td className="text-right">{formatIDR(r.gross_amount)}</td>
                  <td className="text-right">{formatIDR(r.net_amount)}</td>
                  <td className="px-4"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
