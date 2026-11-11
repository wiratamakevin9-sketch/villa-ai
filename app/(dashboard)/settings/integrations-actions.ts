"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";

const back = (q: string) => redirect(`/settings?${q}#integrasi`);

/** Normalisasi nomor: 0812… / +62 812… → 62812… */
function normalizePhone(raw: string) {
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

export async function saveWhatsApp(formData: FormData) {
  const { supabase, org, role } = await getCurrentOrg();
  if (role !== "owner") back("error=" + encodeURIComponent("Hanya owner."));
  const recipients = String(formData.get("recipients") || "")
    .split(/[\n,;]+/).map((s) => normalizePhone(s.trim())).filter((s) => s.length >= 9);
  const { error } = await supabase.from("notification_settings").upsert({
    org_id: org.id,
    wa_enabled: formData.get("wa_enabled") === "on",
    wa_phone_number_id: String(formData.get("phone_number_id") || "").trim() || null,
    wa_template: String(formData.get("template") || "villa_ai_notifikasi").trim(),
    wa_language: String(formData.get("language") || "id").trim(),
    wa_api_version: String(formData.get("api_version") || "v23.0").trim(),
    wa_recipients: recipients,
    notify_daily_alerts: formData.get("notify_daily_alerts") === "on",
    notify_reports: formData.get("notify_reports") === "on",
    notify_staff_tasks: formData.get("notify_staff_tasks") === "on",
    app_url: String(formData.get("app_url") || "").trim() || null,
    updated_at: new Date().toISOString(),
  });
  if (error) back("error=" + encodeURIComponent(error.message));

  const token = String(formData.get("token") || "").trim();
  if (token) {
    const { error: tErr } = await supabase.rpc("set_whatsapp_token", { p_org: org.id, p_token: token });
    if (tErr) back("error=" + encodeURIComponent(tErr.message));
  }
  revalidatePath("/settings");
  back("message=" + encodeURIComponent("Pengaturan WhatsApp tersimpan."));
}

export async function testWhatsApp() {
  const { supabase, org } = await getCurrentOrg();
  const { data, error } = await supabase.rpc("send_whatsapp_test", { p_org: org.id });
  if (error) back("error=" + encodeURIComponent(error.message));
  const r = data as { ok: boolean; error?: string; results?: { to: string; status: number; error: string | null }[] };
  if (r.ok) back("message=" + encodeURIComponent(`Pesan tes terkirim ke ${r.results?.length ?? 0} nomor.`));
  const detail = r.error ?? r.results?.filter((x) => x.error).map((x) => `${x.to}: HTTP ${x.status} – ${x.error}`).join("; ");
  back("error=" + encodeURIComponent(`Gagal mengirim. ${detail ?? ""}`));
}

export async function createSheetsLink() {
  const { supabase, org } = await getCurrentOrg();
  const { data, error } = await supabase.rpc("rotate_export_token", { p_org: org.id });
  if (error) back("error=" + encodeURIComponent(error.message));
  // token hanya ditampilkan sekali (cookie singkat, tidak masuk URL/riwayat browser)
  (await cookies()).set("sheets_token", String(data), { httpOnly: true, maxAge: 600, path: "/settings", sameSite: "strict" });
  back("message=" + encodeURIComponent("Link Google Sheets dibuat. Salin sekarang — hanya ditampilkan sekali."));
}

export async function revokeSheetsLink() {
  const { supabase, org } = await getCurrentOrg();
  await supabase.rpc("revoke_export_token", { p_org: org.id });
  (await cookies()).delete({ name: "sheets_token", path: "/settings" });
  back("message=" + encodeURIComponent("Link Google Sheets dicabut. Rumus IMPORTDATA lama tidak lagi berfungsi."));
}
