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
