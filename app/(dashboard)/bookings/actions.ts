"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { friendlyError, parseRupiah } from "@/lib/errors";

export async function saveBooking(bookingId: string | null, formData: FormData) {
  const { supabase, org } = await getCurrentOrg();
  const back = bookingId ? `/bookings/${bookingId}` : "/bookings/new";
  const fail = (msg: string): never => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const propertyId = String(formData.get("property_id") || "");
  const channelId = String(formData.get("channel_id") || "") || null;
  const guestName = String(formData.get("guest_name") || "").trim();
  if (!propertyId) fail("Pilih villa.");
  if (!guestName) fail("Nama tamu wajib diisi.");

  const gross = parseRupiah(formData.get("gross_amount")) ?? 0;
  let commission = parseRupiah(formData.get("commission_amount"));
  if (commission === null) {
    // Komisi kosong → hitung otomatis dari persentase channel
    const { data: ch } = channelId
      ? await supabase.from("channels").select("commission_pct").eq("id", channelId).single()
      : { data: null };
    commission = Math.round((gross * Number(ch?.commission_pct ?? 0)) / 100);
  }

  // Tamu: perbarui yang lama atau buat baru
  const guest = {
    org_id: org.id,
    name: guestName,
    phone: String(formData.get("guest_phone") || "").trim() || null,
    country: String(formData.get("guest_country") || "").trim() || null,
  };
  let guestId = String(formData.get("guest_id") || "") || null;
  const isNewGuest = !guestId;
  if (guestId) {
    await supabase.from("guests").update(guest).eq("id", guestId);
  } else {
    const { data, error } = await supabase.from("guests").insert(guest).select("id").single();
    if (error) fail(friendlyError(error));
    guestId = data!.id;
  }

  const status = String(formData.get("status") || "confirmed");
  const booking = {
    property_id: propertyId,
    channel_id: channelId,
    guest_id: guestId,
    check_in: String(formData.get("check_in")),
    check_out: String(formData.get("check_out")),
    guests_count: parseRupiah(formData.get("guests_count")),
    gross_amount: gross,
    commission_amount: commission,
    status,
    cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
    external_ref: String(formData.get("external_ref") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  };

  const { error } = bookingId
    ? await supabase.from("bookings").update(booking).eq("id", bookingId)
    : await supabase.from("bookings").insert(booking);
  if (error) {
    // jangan tinggalkan data tamu "yatim" jika booking gagal disimpan
    if (isNewGuest && guestId) await supabase.from("guests").delete().eq("id", guestId);
    fail(friendlyError(error));
  }

  revalidatePath("/", "layout");
  redirect(`/bookings?month=${booking.check_in.slice(0, 7)}&message=${encodeURIComponent("Booking tersimpan.")}`);
}

export async function deleteBooking(bookingId: string) {
  const { supabase } = await getCurrentOrg();
  const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
  if (error) redirect(`/bookings/${bookingId}?error=${encodeURIComponent(friendlyError(error))}`);
  revalidatePath("/", "layout");
  redirect(`/bookings?message=${encodeURIComponent("Booking dihapus.")}`);
}
