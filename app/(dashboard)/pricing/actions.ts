"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { applyRateRange, SetRateRangePayload } from "@/lib/approvals";
import { parseRupiah } from "@/lib/errors";

const back = (property: string, month: string, q: string) => redirect(`/pricing?property=${property}&month=${month}&${q}`);

export async function recompute(property: string, month: string) {
  const { supabase, org } = await getCurrentOrg();
  const { data, error } = await supabase.rpc("compute_rate_recommendations", { p_org: org.id });
  revalidatePath("/pricing");
  back(property, month, error ? `error=${encodeURIComponent(error.message)}` : `message=${encodeURIComponent(`Rekomendasi dihitung ulang (${data} tanggal).`)}`);
}

export async function setRates(property: string, month: string, formData: FormData) {
  const { supabase, user, role, org } = await getCurrentOrg();
  if (role === "staff") back(property, month, "error=" + encodeURIComponent("Hanya owner/manager."));
  const parsed = SetRateRangePayload.safeParse({
    property_id: property,
    date_from: String(formData.get("date_from")),
    date_to: String(formData.get("date_to")),
    rate: parseRupiah(formData.get("rate")) ?? 0,
    min_stay: parseRupiah(formData.get("min_stay")) ?? undefined,
  });
  if (!parsed.success) back(property, month, "error=" + encodeURIComponent(parsed.error.issues.map((i) => i.message).join("; ")));
  try {
    await applyRateRange(supabase, parsed.data!, String(formData.get("reason") || "") || "Diatur manual", user.id);
  } catch (e) {
    back(property, month, "error=" + encodeURIComponent(e instanceof Error ? e.message : String(e)));
  }
  await supabase.rpc("compute_rate_recommendations", { p_org: org.id });
  revalidatePath("/pricing");
  back(property, month, "message=" + encodeURIComponent("Harga tersimpan. Jangan lupa perbarui juga di OTA."));
}

export async function clearRates(property: string, month: string, formData: FormData) {
  const { supabase, org } = await getCurrentOrg();
  const { error } = await supabase.from("rate_calendar").delete().eq("property_id", property)
    .gte("date", String(formData.get("date_from"))).lte("date", String(formData.get("date_to")));
  await supabase.rpc("compute_rate_recommendations", { p_org: org.id });
  revalidatePath("/pricing");
  back(property, month, error ? "error=" + encodeURIComponent(error.message) : "message=" + encodeURIComponent("Harga khusus dihapus; kembali ke harga dasar × musim."));
}

/** Terapkan rekomendasi untuk tanggal-tanggal yang dicentang. */
export async function applyRecommendations(property: string, month: string, formData: FormData) {
  const { supabase, user, org } = await getCurrentOrg();
  const dates = formData.getAll("date").map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dates.length === 0) back(property, month, "error=" + encodeURIComponent("Pilih minimal satu tanggal."));
  const { data: recs } = await supabase.from("rate_recommendations")
    .select("date, recommended_rate").eq("property_id", property).in("date", dates);
  const rows = (recs ?? []).map((r) => ({ property_id: property, date: r.date, rate: r.recommended_rate }));
  const { error } = await supabase.from("rate_calendar").upsert(rows, { onConflict: "property_id,date" });
  if (error) back(property, month, "error=" + encodeURIComponent(error.message));
  const sorted = [...dates].sort();
  await supabase.from("rate_change_log").insert({
    property_id: property, date_from: sorted[0], date_to: sorted[sorted.length - 1],
    new_rate: rows[0]?.rate ?? 0, reason: `Rekomendasi sistem diterapkan untuk ${rows.length} tanggal`, changed_by: user.id,
  });
  await supabase.rpc("compute_rate_recommendations", { p_org: org.id });
  revalidatePath("/pricing");
  back(property, month, "message=" + encodeURIComponent(`${rows.length} harga diterapkan. Jangan lupa perbarui juga di OTA.`));
}
