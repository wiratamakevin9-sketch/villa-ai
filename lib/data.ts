// Data referensi yang sering dipakai di banyak halaman.
import type { SupabaseClient } from "@supabase/supabase-js";

export type PropertyLite = { id: string; name: string; code: string | null };
export type Channel = { id: string; name: string; type: string; commission_pct: number; active: boolean };
export type Category = { id: string; name: string; type: "income" | "expense"; group_name: string | null };

export async function getLookups(supabase: SupabaseClient) {
  const [p, c, k] = await Promise.all([
    supabase.from("properties").select("id, name, code").eq("status", "active").order("name"),
    supabase.from("channels").select("id, name, type, commission_pct, active").order("name"),
    supabase.from("categories").select("id, name, type, group_name").order("group_name").order("name"),
  ]);
  return {
    properties: (p.data ?? []) as PropertyLite[],
    channels: (c.data ?? []) as Channel[],
    categories: (k.data ?? []) as Category[],
  };
}

// Urutan warna channel tetap (tidak berubah walau filter berubah).
// Palet kategorikal tervalidasi untuk buta warna (slot 1–5).
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
export function channelColor(channels: Channel[], channelId: string | null) {
  const idx = channels.findIndex((c) => c.id === channelId);
  return idx === -1 ? "#a8a29e" : SERIES[idx % SERIES.length];
}
