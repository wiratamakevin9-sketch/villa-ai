"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireOwner } from "@/lib/org";
import { friendlyError, parseRupiah } from "@/lib/errors";

const back = (q: string) => redirect(`/team?${q}`);

function staffFields(formData: FormData) {
  return {
    name: String(formData.get("name") || "").trim(),
    role: String(formData.get("role") || "") || null,
    phone: String(formData.get("phone") || "").trim() || null,
    monthly_salary: parseRupiah(formData.get("monthly_salary")),
    property_id: String(formData.get("property_id") || "") || null,
  };
}

export async function addStaff(formData: FormData) {
  const { supabase, org } = await requireManager();
  const f = staffFields(formData);
  if (!f.name) back("error=" + encodeURIComponent("Nama wajib diisi"));
  const { error } = await supabase.from("staff").insert({ org_id: org.id, ...f });
  revalidatePath("/team");
  back(error ? "error=" + encodeURIComponent(friendlyError(error)) : "message=" + encodeURIComponent("Staf ditambahkan."));
}

export async function updateStaff(id: string, formData: FormData) {
  const { supabase } = await requireManager();
  const { error } = await supabase.from("staff").update({ ...staffFields(formData), active: formData.get("active") === "on" }).eq("id", id);
  revalidatePath("/team");
  back(error ? "error=" + encodeURIComponent(friendlyError(error)) : "message=" + encodeURIComponent("Data staf diperbarui."));
}

export async function inviteMember(formData: FormData) {
  const { supabase, org, user } = await requireOwner();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) back("error=" + encodeURIComponent("Email tidak valid"));
  const { error } = await supabase.from("org_invites").upsert({
    org_id: org.id, email, role: String(formData.get("role") || "staff"),
    staff_id: String(formData.get("staff_id") || "") || null, invited_by: user.id, accepted_at: null,
  }, { onConflict: "org_id,email" });
  revalidatePath("/team");
  back(error ? "error=" + encodeURIComponent(error.message)
    : "message=" + encodeURIComponent(`Undangan untuk ${email} dibuat. Minta dia mendaftar di aplikasi dengan email tersebut, lalu klik "Gabung".`));
}

export async function cancelInvite(id: string) {
  const { supabase } = await requireOwner();
  await supabase.from("org_invites").delete().eq("id", id);
  revalidatePath("/team");
}

export async function changeRole(userId: string, formData: FormData) {
  const { supabase, org, user } = await requireOwner();
  if (userId === user.id) back("error=" + encodeURIComponent("Tidak bisa mengubah peran sendiri."));
  const role = String(formData.get("role"));
  const { error } = await supabase.from("memberships").update({ role }).eq("org_id", org.id).eq("user_id", userId);
  revalidatePath("/team");
  back(error ? "error=" + encodeURIComponent(error.message) : "message=" + encodeURIComponent("Peran diperbarui."));
}

export async function removeMember(userId: string) {
  const { supabase, org, user } = await requireOwner();
  if (userId === user.id) back("error=" + encodeURIComponent("Tidak bisa menghapus diri sendiri."));
  await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", userId);
  await supabase.from("staff").update({ user_id: null }).eq("org_id", org.id).eq("user_id", userId);
  revalidatePath("/team");
  back("message=" + encodeURIComponent("Akses dicabut."));
}

