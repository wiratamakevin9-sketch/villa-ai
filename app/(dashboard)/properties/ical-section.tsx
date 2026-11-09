import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/data";
import { addFeed, deleteFeed, syncNow } from "./ical-actions";

type Feed = { id: string; channel_name: string; url: string; last_synced_at: string | null; last_status: string | null; last_error: string | null; event_count: number | null };

const mask = (u: string) => { try { const x = new URL(u); return `${x.host}/…${u.slice(-6)}`; } catch { return "…"; } };

export async function IcalSection({ supabase, propertyId, channels }: { supabase: SupabaseClient; propertyId: string; channels: Channel[] }) {
  const { data } = await supabase.from("ical_feeds")
    .select("id, channel_name, url, last_synced_at, last_status, last_error, event_count")
    .eq("property_id", propertyId).order("created_at");
  const feeds = (data ?? []) as Feed[];
  const otas = channels.filter((c) => c.type === "ota" || c.type === "agent");

  return (
    <div id="ical" className="card space-y-4">
      <div>
        <h2 className="font-semibold">Kalender OTA (iCal)</h2>
        <p className="text-sm text-stone-500">
          Sinkron otomatis setiap jam. Booking baru dari OTA muncul di <b>Booking → Dari OTA</b> untuk dicatat beserta harganya.
        </p>
      </div>

      {feeds.length > 0 && (
        <ul className="divide-y divide-stone-100 text-sm">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium">{f.channel_name} <span className="font-normal text-stone-400">{mask(f.url)}</span></p>
                <p className={`text-xs ${f.last_status === "error" ? "text-red-700" : "text-stone-500"}`}>
                  {f.last_status === "ok" && `✓ ${f.event_count ?? 0} event · sinkron ${new Date(f.last_synced_at!).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}`}
                  {f.last_status === "error" && `✕ Gagal: ${f.last_error}`}
                  {!f.last_status && "Belum disinkron"}
                </p>
              </div>
              <form action={deleteFeed.bind(null, propertyId, f.id)}>
                <button className="text-xs text-stone-400 hover:text-red-700">Hapus</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addFeed.bind(null, propertyId)} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="ical-ch">Channel</label>
          <select id="ical-ch" name="channel_name" className="input">
            {otas.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ical-url">Link ekspor kalender (iCal)</label>
          <input id="ical-url" name="url" className="input" placeholder="https://www.airbnb.com/calendar/ical/….ics" required />
        </div>
        <button className="btn">Tambah</button>
      </form>
      {feeds.length > 0 && (
        <form action={syncNow.bind(null, propertyId)}><button className="btn-secondary">Sinkron sekarang</button></form>
      )}
      <details className="text-sm text-stone-600">
        <summary className="cursor-pointer">Cara mendapatkan link iCal</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Airbnb:</b> Kalender → pilih listing → Ketersediaan → Sambungkan kalender → Ekspor kalender → salin link.</li>
          <li><b>Booking.com:</b> Extranet → Tarif &amp; Ketersediaan → Sinkronisasi kalender → Ekspor kalender → salin link.</li>
          <li><b>Agoda:</b> YCS → Kalender → Sinkronisasi iCal → salin link ekspor.</li>
          <li>Link ini rahasia — jangan dibagikan. Hanya owner/manager yang bisa melihatnya.</li>
        </ul>
      </details>
    </div>
  );
}
