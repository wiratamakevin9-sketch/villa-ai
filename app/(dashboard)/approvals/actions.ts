"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { executeApproval } from "@/lib/approvals";

export async function decide(id: string, decision: "approve" | "reject") {
  const { supabase, user, role } = await getCurrentOrg();
  if (role === "staff") redirect("/approvals?error=" + encodeURIComponent("Hanya owner/manager yang bisa memutuskan."));

  const { data: a } = await supabase.from("approvals").select("*").eq("id", id).single();
  if (!a || a.status !== "pending") redirect("/approvals?error=" + encodeURIComponent("Usulan tidak ditemukan atau sudah diputuskan."));

  const now = new Date().toISOString();
  let status: string = decision === "reject" ? "rejected" : "executed";
  let msg = decision === "reject" ? "Usulan ditolak." : "Usulan disetujui dan dijalankan.";
  if (decision === "approve") {
    try {
      await executeApproval(supabase, a, user.id);
    } catch (e) {
      status = "failed";
      msg = `Gagal menjalankan: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  await supabase.from("approvals").update({ status, decided_by: user.id, decided_at: now }).eq("id", id);
  await supabase.from("audit_log").insert({
    org_id: a.org_id, actor: user.id, actor_type: "user", action: `approval_${status}`, entity: "approval",
    entity_id: id, diff: { action_type: a.action_type, payload: a.payload },
  });
  revalidatePath("/", "layout");
  redirect(`/approvals?${status === "failed" ? "error" : "message"}=${encodeURIComponent(msg)}`);
}
