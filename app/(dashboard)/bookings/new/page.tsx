import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { Flash } from "@/components/flash";
import { BookingForm } from "../booking-form";
import { saveBooking } from "../actions";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; property?: string; check_in?: string; check_out?: string; channel?: string; ical?: string }>;
}) {
  const { error, property, check_in, check_out, channel, ical } = await searchParams;
  const { supabase } = await getCurrentOrg();
  const { properties, channels } = await getLookups(supabase);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/bookings" className="text-sm text-emerald-700">‹ Kembali ke booking</Link>
      <h1 className="text-2xl font-semibold">Tambah booking</h1>
      <Flash error={error} />
      {ical && <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Dari kalender {channel}: tanggal sudah terisi. Lengkapi nama tamu dan harga dari detail reservasi di {channel}.</p>}
      <div className="card">
        <BookingForm action={saveBooking.bind(null, null)} properties={properties}
          channels={channels} defaultPropertyId={property}
          defaults={{ check_in, check_out, ical_event_id: ical, channel_id: channels.find((c) => c.name === channel)?.id }} />
      </div>
    </div>
  );
}
