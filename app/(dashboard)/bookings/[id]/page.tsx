import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { Flash } from "@/components/flash";
import { BookingForm, type BookingRecord } from "../booking-form";
import { deleteBooking, saveBooking } from "../actions";

export default async function EditBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, role } = await getCurrentOrg();
  const [{ properties, channels }, { data: booking }] = await Promise.all([
    getLookups(supabase),
    supabase.from("bookings").select("*, guests(name, phone, country)").eq("id", id).maybeSingle(),
  ]);
  if (!booking) notFound();

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/bookings?month=${booking.check_in.slice(0, 7)}`} className="text-sm text-emerald-700">
        ‹ Kembali ke booking
      </Link>
      <h1 className="text-2xl font-semibold">Edit booking</h1>
      <Flash error={error} />
      <div className="card">
        <BookingForm action={saveBooking.bind(null, id)} properties={properties}
          channels={channels} booking={booking as BookingRecord} />
      </div>
      {role !== "staff" && (
        <form action={deleteBooking.bind(null, id)} className="text-right">
          <button className="text-sm text-red-700 underline">
            Hapus booking ini (gunakan status &quot;Dibatalkan&quot; jika tamu membatalkan)
          </button>
        </form>
      )}
    </div>
  );
}
