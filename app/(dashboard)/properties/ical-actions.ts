"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";

const back = (id: string, q: string) => redirect(`/properties/${id}?${q}#ical`);

export async function addFeed(propertyId: string, formData: FormData) {
  const { supabase } = await getCurrentOrg();
  const url = String(formData.get("url") || "").trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https:\/\/\S+$/.test(url)) back(propertyId, "error=" + encodeURIComponent("Link harus diawali https:// atau webcal://"));
  const { error } = await supabase.from("ical_feeds").insert({
    property_id: propertyId, channel_name: String(formData.get("channel_name")), url,
  });
  if (error) back(propertyId, "error=" + encodeURIComponent(error.code === "23505" ? "Link ini sudah ditambahkan." : error.message));
  await syncNow(propertyId);
}

export async function deleteFeed(propertyId: string, feedId: string) {
  const { supabase } = await getCurrentOrg();
  await supabase.from("ical_feeds").delete().eq("id", feedId);
  revalidatePath(`/properties/${propertyId}`);
  back(propertyId, "message=" + encodeURIComponent("Kalender dihapus."));
}

export async function syncNow(propertyId: string) {
  const { supabase, org } = await getCurrentOrg();
  const { data, error } = await supabase.rpc("sync_ical", { p_org: org.id });
  revalidatePath("/", "layout");
  if (error) back(propertyId, "error=" + encodeURIComponent(error.message));
  const results = (data ?? []) as { ok: boolean; error?: string }[];
  const failed = results.filter((r) => !r.ok).length;
  back(propertyId, failed
    ? "error=" + encodeURIComponent(`${failed} kalender gagal disinkron. Lihat status di bawah.`)
    : "message=" + encodeURIComponent(`Sinkron selesai (${results.length} kalender).`));
}
