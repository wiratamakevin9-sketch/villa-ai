"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOrg } from "@/lib/org";

export type ImportResult = { row: number; status: "ok" | "duplicate" | "conflict" | "error"; message?: string };

export async function importBookings(
  propertyId: string,
  rows: Record<string, string | number | null>[],
): Promise<{ results?: ImportResult[]; error?: string }> {
  const { supabase } = await getCurrentOrg();
  if (!propertyId) return { error: "Pilih villa tujuan." };
  if (rows.length === 0) return { error: "Tidak ada baris untuk diimpor." };
  if (rows.length > 2000) return { error: "Maksimal 2.000 baris per impor. Pecah file menjadi beberapa bagian." };

  const { data, error } = await supabase.rpc("import_bookings", { p_property: propertyId, p_rows: rows });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { results: data as ImportResult[] };
}
