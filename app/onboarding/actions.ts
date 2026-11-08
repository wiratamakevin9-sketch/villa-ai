"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createOrganization(formData: FormData) {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();

  const { data: orgId, error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);

  if (formData.get("demo") === "on") {
    const { error: demoError } = await supabase.rpc("load_demo_data", { p_org: orgId });
    if (demoError) redirect(`/?error=${encodeURIComponent(demoError.message)}`);
  }
  redirect("/");
}
