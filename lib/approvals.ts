// =====================================================================
// Antrean persetujuan: AI hanya MENGUSULKAN, manusia yang menyetujui.
// Daftar aksi yang didukung + validasi + pelaksanaannya.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const CreateTaskPayload = z.object({
  property_id: z.string().uuid(),
  type: z.enum(["cleaning", "maintenance", "inspection", "purchase", "other"]),
  title: z.string().min(3).max(200),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  notes: z.string().max(2000).optional(),
}).strict();

export const UpdateBaseRatePayload = z.object({
  property_id: z.string().uuid(),
  new_rate: z.number().int().min(100_000).max(500_000_000),
}).strict();

export const ACTION_LABELS: Record<string, string> = {
  create_task: "Buat tugas",
  update_base_rate: "Ubah harga dasar",
};

/** Simpan usulan ke antrean (status pending). */
export async function proposeAction(
  supabase: SupabaseClient,
  action: "create_task" | "update_base_rate",
  payload: unknown,
  reason: string,
) {
  const parsed = action === "create_task" ? CreateTaskPayload.parse(payload) : UpdateBaseRatePayload.parse(payload);
  const { data: prop, error: pErr } = await supabase
    .from("properties").select("org_id, name, base_rate").eq("id", parsed.property_id).single();
  if (pErr || !prop) throw new Error("Villa tidak ditemukan");
  const full = { ...parsed, property_name: prop.name, ...(action === "update_base_rate" ? { old_rate: Number(prop.base_rate ?? 0) } : {}) };
  const { data, error } = await supabase.from("approvals")
    .insert({ org_id: prop.org_id, action_type: action, payload: full, reason })
    .select("id").single();
  if (error) throw new Error(error.code === "42501" ? "Hanya owner/manager yang bisa membuat usulan." : error.message);
  return { approval_id: data.id as string, status: "pending", summary: full };
}

/** Jalankan usulan yang sudah disetujui. */
export async function executeApproval(supabase: SupabaseClient, approval: { id: string; org_id: string; action_type: string; payload: Record<string, unknown>; reason: string | null }, userId: string) {
  if (approval.action_type === "create_task") {
    const p = CreateTaskPayload.parse(stripMeta(approval.payload));
    const { error } = await supabase.from("tasks").insert({
      property_id: p.property_id, type: p.type, title: p.title, priority: p.priority,
      due_at: p.due_date ? `${p.due_date}T09:00:00+08:00` : null,
      notes: [p.notes, approval.reason ? `Alasan AI: ${approval.reason}` : null].filter(Boolean).join("\n") || null,
    });
    if (error) throw new Error(error.message);
  } else if (approval.action_type === "update_base_rate") {
    const p = UpdateBaseRatePayload.parse(stripMeta(approval.payload));
    const { data: prop } = await supabase.from("properties").select("base_rate").eq("id", p.property_id).single();
    const { error } = await supabase.from("properties").update({ base_rate: p.new_rate }).eq("id", p.property_id);
    if (error) throw new Error(error.message);
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("rate_change_log").insert({
      property_id: p.property_id, date_from: today, date_to: today, old_rate: prop?.base_rate ?? null,
      new_rate: p.new_rate, reason: approval.reason, approval_id: approval.id, changed_by: userId,
    });
  } else {
    throw new Error(`Jenis aksi tidak dikenal: ${approval.action_type}`);
  }
}

function stripMeta(p: Record<string, unknown>) {
  const rest = { ...p };
  delete rest.property_name;
  delete rest.old_rate;
  return rest;
}
