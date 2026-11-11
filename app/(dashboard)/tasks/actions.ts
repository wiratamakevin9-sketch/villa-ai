"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { parseRupiah } from "@/lib/errors";

const CATEGORY_FOR: Record<string, string> = {
  cleaning: "Kebersihan & Laundry", maintenance: "Maintenance & Perbaikan", inspection: "Maintenance & Perbaikan",
  purchase: "Lain-lain", other: "Lain-lain",
};

export async function setTaskStatus(id: string, status: "todo" | "in_progress" | "done" | "cancelled") {
  const { supabase } = await getCurrentOrg();
  await supabase.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/tasks");
}

export async function assignTask(id: string, formData: FormData) {
  const { supabase } = await getCurrentOrg();
  await supabase.from("tasks").update({ assigned_to: String(formData.get("assigned_to") || "") || null }).eq("id", id);
  revalidatePath("/tasks");
}

/** Selesaikan tugas; biaya (opsional, owner/manager) dicatat sebagai pengeluaran villa. */
export async function completeTask(id: string, formData: FormData) {
  const { supabase, org, user, role } = await getCurrentOrg();
  const cost = role !== "staff" ? parseRupiah(formData.get("cost")) : null;
  const { data: t } = await supabase.from("tasks").select("id, property_id, type, title").eq("id", id).single();
  if (!t) redirect("/tasks?error=" + encodeURIComponent("Tugas tidak ditemukan"));
  await supabase.from("tasks").update({ status: "done", completed_at: new Date().toISOString(), cost }).eq("id", id);
  if (cost && cost > 0) {
    const { data: cat } = await supabase.from("categories").select("id")
      .eq("org_id", org.id).eq("type", "expense").eq("name", CATEGORY_FOR[t!.type] ?? "Lain-lain").maybeSingle();
    if (cat) {
      await supabase.from("transactions").insert({
        org_id: org.id, property_id: t!.property_id, category_id: cat.id, type: "expense", amount: cost,
        date: new Date().toISOString().slice(0, 10), description: `Tugas: ${t!.title}`, created_by: user.id,
      });
    }
  }
  revalidatePath("/", "layout");
  redirect("/tasks?message=" + encodeURIComponent(cost ? "Tugas selesai & biaya dicatat di Keuangan." : "Tugas selesai."));
}

export async function addTask(formData: FormData) {
  const { supabase } = await getCurrentOrg();
  const due = String(formData.get("due_date") || "");
  const { error } = await supabase.from("tasks").insert({
    property_id: String(formData.get("property_id")),
    type: String(formData.get("type")),
    title: String(formData.get("title")).trim(),
    priority: String(formData.get("priority") || "normal"),
    assigned_to: String(formData.get("assigned_to") || "") || null,
    due_at: due ? `${due}T09:00:00+08:00` : null,
  });
  redirect(`/tasks?${error ? "error" : "message"}=${encodeURIComponent(error ? error.message : "Tugas ditambahkan.")}`);
}
