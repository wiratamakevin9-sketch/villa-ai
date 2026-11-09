import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { channelColor, getLookups } from "@/lib/data";
import { currentMonth, isValidMonth, monthRange } from "@/lib/dates";
import { MonthNav } from "@/components/month-nav";
import { BookingTabs } from "../tabs";

type B = {
  id: string; property_id: string; channel_id: string | null; check_in: string; check_out: string;
  guests: { name: string } | null;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = isValidMonth(sp.month) ? sp.month : currentMonth();
  const { start, end, days } = monthRange(month);
  const { supabase } = await getCurrentOrg();
  const { properties, channels } = await getLookups(supabase);
  const { data } = await supabase
    .from("bookings")
    .select("id, property_id, channel_id, check_in, check_out, guests(name)")
    .in("status", ["confirmed", "checked_in", "completed"])
    .lt("check_in", end)
    .gt("check_out", start);
  const bookings = (data ?? []) as unknown as B[];

  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const today = new Date().toISOString().slice(0, 10);
  const dayName = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("id-ID", { weekday: "narrow" });

  // Bangun peta: villa → tanggal → booking
  const grid = new Map<string, Map<string, B>>();
  for (const b of bookings) {
    const m = grid.get(b.property_id) ?? new Map<string, B>();
    for (const d of dates) if (d >= b.check_in && d < b.check_out) m.set(d, b);
    grid.set(b.property_id, m);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Booking</h1>
      <BookingTabs active="calendar" />
      <MonthNav month={month} basePath="/bookings/calendar" />

      <div className="card overflow-x-auto p-0">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-40 bg-white px-3 py-2 text-left text-sm">Villa</th>
              {dates.map((d) => (
                <th key={d} className={`w-8 min-w-8 px-0 py-1 text-center font-normal ${d === today ? "text-emerald-700 font-semibold" : "text-stone-500"}`}>
                  <div>{dayName(d)}</div><div>{Number(d.slice(8))}</div>
                </th>
              ))}
              <th className="px-3 text-right font-normal text-stone-500">Terisi</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((p) => {
              const row = grid.get(p.id) ?? new Map<string, B>();
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 border-t border-stone-100 bg-white px-3 py-2 text-sm font-medium">{p.name}</td>
                  {dates.map((d) => {
                    const b = row.get(d);
                    const isStart = b && (d === b.check_in || d === start);
                    return (
                      <td key={d} className="h-9 border-t border-stone-100 p-0">
                        {b ? (
                          <Link href={`/bookings/${b.id}`}
                            title={`${b.guests?.name ?? "Tamu"} · ${channels.find((c) => c.id === b.channel_id)?.name ?? "—"} · ${b.check_in} → ${b.check_out}`}
                            className={`block h-6 ${isStart ? "ml-0.5 rounded-l" : ""} ${row.get(dates[dates.indexOf(d) + 1])?.id !== b.id ? "mr-0.5 rounded-r" : ""}`}
                            style={{ background: channelColor(channels, b.channel_id) }}>
                            <span className="sr-only">{b.guests?.name}</span>
                          </Link>
                        ) : (
                          <span className="block h-6" />
                        )}
                      </td>
                    );
                  })}
                  <td className="border-t border-stone-100 px-3 text-right text-sm">{Math.round((100 * row.size) / days)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-stone-600">
        {channels.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: channelColor(channels, c.id) }} />
            {c.name}
          </span>
        ))}
      </div>
      <p className="text-xs text-stone-500">Arahkan kursor ke blok warna untuk melihat nama tamu. Klik untuk membuka booking.</p>
    </div>
  );
}
