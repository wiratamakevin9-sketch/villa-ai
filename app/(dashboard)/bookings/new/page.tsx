import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { Flash } from "@/components/flash";
import { BookingForm } from "../booking-form";
import { saveBooking } from "../actions";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; property?: string }>;
}) {
  const { error, property } = await searchParams;
  const { supabase } = await getCurrentOrg();
  const { properties, channels } = await getLookups(supabase);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/bookings" className="text-sm text-emerald-700">‹ Kembali ke booking</Link>
      <h1 className="text-2xl font-semibold">Tambah booking</h1>
      <Flash error={error} />
      <div className="card">
        <BookingForm action={saveBooking.bind(null, null)} properties={properties}
          channels={channels} defaultPropertyId={property} />
      </div>
    </div>
  );
}
