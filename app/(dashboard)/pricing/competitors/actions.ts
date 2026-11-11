"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { parseRupiah } from "@/lib/errors";
import { researchCompetitors } from "@/lib/agent/research";
import { friendlyAiError } from "@/lib/agent/claude";

const back = (property: string, q: string) => redirect(`/pricing/competitors?property=${property}&${q}`);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
function eachDate(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export async function addCompetitor(property: string, formData: FormData) {
  const { supabase, org } = await getCurrentOrg();
  const { error } = await supabase.from("competitors").insert({
    org_id: org.id,
    name: String(formData.get("name") || "").trim(),
    url: String(formData.get("url") || "").trim() || null,
    location: String(formData.get("location") || "").trim() || null,
    bedrooms: parseRupiah(formData.get("bedrooms")),
    source: "manual",
  });
  revalidatePath("/pricing/competitors");
  back(property, error ? "error=" + encodeURIComponent(error.message) : "message=" + encodeURIComponent("Kompetitor ditambahkan."));
}

export async function addCompetitorRate(property: string, formData: FormData) {
  const { supabase, org } = await getCurrentOrg();
  const from = String(formData.get("date_from")), to = String(formData.get("date_to"));
  const rate = parseRupiah(formData.get("rate"));
  if (!rate || to < from || daysBetween(from, to) > 92) back(property, "error=" + encodeURIComponent("Periksa tanggal (maks 93 hari) dan harga."));
  const rows = eachDate(from, to).map((date) => ({ competitor_id: String(formData.get("competitor_id")), date, rate, source: "manual" }));
  const { error } = await supabase.from("competitor_rates").insert(rows);
  await supabase.rpc("compute_rate_recommendations", { p_org: org.id });
  revalidatePath("/pricing");
  back(property, error ? "error=" + encodeURIComponent(error.message) : "message=" + encodeURIComponent(`${rows.length} harga kompetitor tersimpan; rekomendasi dihitung ulang.`));
}

export async function runResearch(property: string, formData: FormData) {
  const { supabase, org, user } = await getCurrentOrg();
  const from = String(formData.get("date_from")), to = String(formData.get("date_to"));
  if (to < from || daysBetween(from, to) > 30) back(property, "error=" + encodeURIComponent("Rentang tanggal maksimal 31 hari."));
  const { data: villa } = await supabase.from("properties")
    .select("id, name, location, bedrooms, max_guests, base_rate").eq("id", property).single();
  if (!villa) back(property, "error=Villa%20tidak%20ditemukan");

  let result;
  try {
    result = await researchCompetitors(villa!, from, to);
  } catch (e) {
    back(property, "error=" + encodeURIComponent(friendlyAiError(e)));
  }

  // Simpan kompetitor (gabungkan dengan nama yang sama) + harganya per tanggal
  let saved = 0;
  for (const l of result!.listings) {
    const a = l.date_from < from ? from : l.date_from, b = l.date_to > to ? to : l.date_to;
    if (b < a) continue;
    let { data: comp } = await supabase.from("competitors").select("id").eq("org_id", org.id).ilike("name", l.name).maybeSingle();
    if (!comp) {
      ({ data: comp } = await supabase.from("competitors").insert({
        org_id: org.id, name: l.name, url: l.url, location: l.location, bedrooms: l.bedrooms, source: "ai_research",
        notes: `Ditemukan lewat riset AI (${l.source_site})`,
      }).select("id").single());
    }
    if (!comp) continue;
    const rows = eachDate(a, b).map((date) => ({ competitor_id: comp!.id, date, rate: l.nightly_rate_idr, source: `ai:${l.source_site}:${l.confidence}` }));
    const { error } = await supabase.from("competitor_rates").insert(rows);
    if (!error) saved += 1;
  }

  // Ringkasan riset disimpan sebagai laporan khusus villa (tidak tampil di daftar laporan umum)
  await supabase.from("reports").insert({
    org_id: org.id, property_id: property, period_type: "custom", period_start: from, period_end: to,
    metrics: { kind: "competitor_research", listings: result!.listings }, ai_summary: result!.summary,
  });
  await supabase.from("audit_log").insert({ org_id: org.id, actor: user.id, actor_type: "user", action: "competitor_research", entity: "property", entity_id: property });
  await supabase.rpc("compute_rate_recommendations", { p_org: org.id });
  revalidatePath("/pricing");
  back(property, "message=" + encodeURIComponent(`Riset selesai: ${result!.listings.length} listing ditemukan, ${saved} disimpan. Rekomendasi dihitung ulang.`));
}
