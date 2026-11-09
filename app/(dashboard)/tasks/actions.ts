"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";

export async function setTaskStatus(id: string, status: "todo" | "in_progress" | "done" | "cancelled") {
  const { supabase } = await getCurrentOrg();
  await supabase.from("tasks").update({ status, completed_at: status === "done" ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/tasks");
}

export async function addTask(formData: FormData) {
  const { supabase } = await getCurrentOrg();
  const due = String(formData.get("due_date") || "");
  const { error } = await supabase.from("tasks").insert({
    property_id: String(formData.get("property_id")),
    type: String(formData.get("type")),
    title: String(formData.get("title")).trim(),
    priority: String(formData.get("priority") || "normal"),
    due_at: due ? `${due}T09:00:00+08:00` : null,
  });
  redirect(`/tasks?${error ? "error" : "message"}=${encodeURIComponent(error ? error.message : "Tugas ditambahkan.")}`);
}
