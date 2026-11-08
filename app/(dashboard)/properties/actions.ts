"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";

function num(v: FormDataEntryValue | null) {
  const s = String(v ?? "").replace(/[^\d]/g, "");
  return s === "" ? null : Number(s);
}

export async function addProperty(formData: FormData) {
  const { supabase, org } = await getCurrentOrg();

  const { error } = await supabase.from("properties").insert({
    org_id: org.id,
    name: String(formData.get("name")).trim(),
    code: String(formData.get("code") || "").trim() || null,
    location: String(formData.get("location") || "").trim() || null,
    bedrooms: num(formData.get("bedrooms")),
    bathrooms: num(formData.get("bathrooms")),
    max_guests: num(formData.get("max_guests")),
    base_rate: num(formData.get("base_rate")),
    purchase_price: num(formData.get("purchase_price")),
    opening_date: String(formData.get("opening_date") || "") || null,
  });

  if (error) {
    const msg = error.code === "23505" ? "Nama villa sudah dipakai" : error.message;
    redirect(`/properties?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/", "layout");
  redirect("/properties");
}
