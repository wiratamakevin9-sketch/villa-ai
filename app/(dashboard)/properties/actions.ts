"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { friendlyError, parseRupiah } from "@/lib/errors";

function readFields(formData: FormData) {
  const text = (k: string) => String(formData.get(k) || "").trim() || null;
  return {
    name: String(formData.get("name")).trim(),
    code: text("code"),
    location: text("location"),
    bedrooms: parseRupiah(formData.get("bedrooms")),
    bathrooms: parseRupiah(formData.get("bathrooms")),
    max_guests: parseRupiah(formData.get("max_guests")),
    base_rate: parseRupiah(formData.get("base_rate")),
    purchase_price: parseRupiah(formData.get("purchase_price")),
    min_rate: parseRupiah(formData.get("min_rate")),
    max_rate: parseRupiah(formData.get("max_rate")),
    opening_date: text("opening_date"),
  };
}

export async function addProperty(formData: FormData) {
  const { supabase, org } = await getCurrentOrg();
  const { error } = await supabase.from("properties").insert({ org_id: org.id, ...readFields(formData) });
  if (error) redirect(`/properties?error=${encodeURIComponent(friendlyError(error))}`);
  revalidatePath("/", "layout");
  redirect(`/properties?message=${encodeURIComponent("Villa ditambahkan.")}`);
}

export async function updateProperty(id: string, formData: FormData) {
  const { supabase } = await getCurrentOrg();
  const status = String(formData.get("status") || "active");
  const { error } = await supabase.from("properties").update({ ...readFields(formData), status }).eq("id", id);
  if (error) redirect(`/properties/${id}?error=${encodeURIComponent(friendlyError(error))}`);
  revalidatePath("/", "layout");
  redirect(`/properties?message=${encodeURIComponent("Data villa diperbarui.")}`);
}
