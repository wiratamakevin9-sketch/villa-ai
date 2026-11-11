import Link from "next/link";
import { requireManager } from "@/lib/org";
import { formatDate } from "@/lib/dates";
import { BookingTabs } from "../tabs";
import { setEventStatus } from "./actions";

type Ev = {
  id: string; channel_name: string; summary: string | null; start_date: string; end_date: string; status: string;
  property_id: string; booking_id: string | null; properties: { name: string } | null;
  bookings: { id: string; status: string; guests: { name: string } | null } | null;
};

export default async function InboxPage() {
  const { supabase, role } = await requireManager();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: pending }, { data: removed }] = await Promise.all([
    supabase.from("ical_events")
      .select("id, channel_name, summary, start_date, end_date, status, property_id, booking_id, properties(name), bookings(id, status, guests(name))")
      .eq("status", "active").eq("is_block", false).is("booking_id", null).gte("end_date", today)
      .order("start_date").limit(100),
    supabase.from("ical_events")
      .select("id, channel_name, summary, start_date, end_date, status, property_id, booking_id, properties(name), bookings(id, status, guests(name))")
      .eq("status", "removed").not("booking_id", "is", null).gte("start_date", today).order("start_date").limit(50),
  ]);
  const toRecord = (pending ?? []) as unknown as Ev[];
  const cancelled = ((removed ?? []) as unknown as Ev[]).filter((e) => e.bookings && ["confirmed", "checked_in"].includes(e.bookings.status));
  const canEdit = role !== "staff";
  const nights = (e: Ev) => Math.round((Date.parse(e.end_date) - Date.parse(e.start_date)) / 86_400_000);

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Booking</h1>
      <BookingTabs active="inbox" />

      <div className="card space-y-3">
        <div>
          <h2 className="font-semibold">Belum dicatat ({toRecord.length})</h2>
          <p className="text-sm text-stone-500">Booking yang terlihat di kalender OTA tetapi belum ada di Villa AI. Catat agar pendapatan & laporan akurat (kalender OTA tidak berisi harga).</p>
        </div>
        {toRecord.length === 0 ? (
          <p className="text-sm text-stone-500">✅ Semua booking dari kalender OTA sudah dicatat.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {toRecord.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{e.properties?.name} · {e.channel_name}</p>
                  <p className="text-stone-500">{formatDate(e.start_date)} → {formatDate(e.end_date)} · {nights(e)} malam{e.summary ? ` · “${e.summary}”` : ""}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Link className="btn px-3 py-1"
                      href={`/bookings/new?property=${e.property_id}&check_in=${e.start_date}&check_out=${e.end_date}&channel=${encodeURIComponent(e.channel_name)}&ical=${e.id}`}>
                      Catat booking
                    </Link>
                    <form action={setEventStatus.bind(null, e.id, "ignored")}>
                      <button className="btn-secondary px-3 py-1" title="Bukan booking tamu (mis. blokir pribadi)">Abaikan</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {cancelled.length > 0 && (
        <div className="card space-y-2 border-amber-200">
          <h2 className="font-semibold">⚠️ Mungkin dibatalkan ({cancelled.length})</h2>
          <p className="text-sm text-stone-500">Booking ini tercatat di Villa AI tetapi sudah hilang dari kalender OTA. Cek di OTA, lalu ubah status booking jika memang batal.</p>
          <ul className="divide-y divide-stone-100 text-sm">
            {cancelled.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{e.properties?.name} · {e.bookings?.guests?.name ?? "Tamu"} · {formatDate(e.start_date)} → {formatDate(e.end_date)} ({e.channel_name})</span>
                <Link href={`/bookings/${e.booking_id}`} className="text-emerald-700 underline">Buka booking</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-stone-500">Tambahkan link kalender OTA di menu <Link href="/properties" className="underline">Villa</Link> → Edit → Kalender OTA.</p>
    </div>
  );
}
