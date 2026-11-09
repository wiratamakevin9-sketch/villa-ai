"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";

async function runDemo(fn: "load_demo_data" | "clear_demo_data") {
  const { supabase, org } = await getCurrentOrg();
  const { data, error } = await supabase.rpc(fn, { p_org: org.id });
  revalidatePath("/", "layout");
  const key = error ? "error" : "message";
  redirect(`/settings?${key}=${encodeURIComponent(error ? error.message : String(data))}`);
}

export async function loadDemo() {
  await runDemo("load_demo_data");
}

export async function clearDemo() {
  await runDemo("clear_demo_data");
}

export async function updateChannel(id: string, formData: FormData) {
  const { supabase } = await getCurrentOrg();
  const pct = Number(String(formData.get("commission_pct") || "0").replace(",", "."));
  const { error } = await supabase
    .from("channels")
    .update({ commission_pct: pct, active: formData.get("active") === "on" })
    .eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/settings?${error ? "error" : "message"}=${encodeURIComponent(error ? error.message : "Channel diperbarui.")}`);
}

export async function addChannel(formData: FormData) {
  const { supabase, org } = await getCurrentOrg();
  const { error } = await supabase.from("channels").insert({
    org_id: org.id,
    name: String(formData.get("name") || "").trim(),
    type: String(formData.get("type") || "other"),
    commission_pct: Number(String(formData.get("commission_pct") || "0").replace(",", ".")),
  });
  revalidatePath("/", "layout");
  redirect(`/settings?${error ? "error" : "message"}=${encodeURIComponent(error ? (error.code === "23505" ? "Nama channel sudah ada." : error.message) : "Channel ditambahkan.")}`);
}
