"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/org";
import { parseRupiah } from "@/lib/errors";

const back = (pid: string, q: string) => redirect(`/properties/${pid}?${q}#aset`);

export async function addAsset(propertyId: string, formData: FormData) {
  const { supabase, org } = await requireManager();
  const { error } = await supabase.from("assets").insert({
    property_id: propertyId,
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "").trim() || null,
    last_service_at: String(formData.get("last_service_at") || "") || null,
    service_interval_days: parseRupiah(formData.get("service_interval_days")),
    cost: parseRupiah(formData.get("cost")),
  });
  if (!error) await supabase.rpc("generate_ops_tasks", { p_org: org.id });
  revalidatePath(`/properties/${propertyId}`);
  back(propertyId, error ? "error=" + encodeURIComponent(error.message) : "message=" + encodeURIComponent("Aset ditambahkan."));
}

export async function markServiced(propertyId: string, assetId: string) {
  const { supabase, org } = await requireManager();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  await supabase.from("assets").update({ last_service_at: today }).eq("id", assetId);
  // tugas servis yang masih terbuka untuk aset ini dianggap selesai
  await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString() })
    .eq("asset_id", assetId).in("status", ["todo", "in_progress"]);
  await supabase.rpc("generate_ops_tasks", { p_org: org.id });
  revalidatePath(`/properties/${propertyId}`);
  back(propertyId, "message=" + encodeURIComponent("Servis dicatat hari ini."));
}

export async function deleteAsset(propertyId: string, assetId: string) {
  const { supabase } = await requireManager();
  await supabase.from("assets").delete().eq("id", assetId);
  revalidatePath(`/properties/${propertyId}`);
  back(propertyId, "message=" + encodeURIComponent("Aset dihapus."));
}
