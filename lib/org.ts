// Mengambil organisasi (bisnis) milik user yang sedang login.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "manager" | "staff";

export async function getCurrentOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("role, organizations(id, name, currency, timezone)")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!membership?.organizations) redirect("/onboarding");

  const org = membership.organizations as unknown as {
    id: string;
    name: string;
    currency: string;
    timezone: string;
  };
  return { supabase, user, org, role: membership.role as Role };
}

/** Halaman khusus owner/manager: staf diarahkan ke Operasional. */
export async function requireManager() {
  const ctx = await getCurrentOrg();
  if (ctx.role === "staff") redirect("/tasks");
  return ctx;
}

/** Halaman khusus owner. */
export async function requireOwner() {
  const ctx = await getCurrentOrg();
  if (ctx.role !== "owner") redirect(ctx.role === "staff" ? "/tasks" : "/");
  return ctx;
}
