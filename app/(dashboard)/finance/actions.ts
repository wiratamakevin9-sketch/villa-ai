"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { friendlyError, parseRupiah } from "@/lib/errors";

const MAX_FILE = 10 * 1024 * 1024;

export async function addTransaction(formData: FormData) {
  const { supabase, org, user } = await getCurrentOrg();
  const date = String(formData.get("date") || "");
  const back = `/finance?month=${date.slice(0, 7)}`;
  const fail = (msg: string): never => redirect(`${back}&error=${encodeURIComponent(msg)}`);

  const amount = parseRupiah(formData.get("amount"));
  const categoryId = String(formData.get("category_id") || "");
  if (!amount || amount <= 0) fail("Jumlah harus lebih dari 0.");
  if (!categoryId) fail("Pilih kategori.");

  const { data: cat } = await supabase.from("categories").select("type").eq("id", categoryId).single();
  if (!cat) fail("Kategori tidak ditemukan.");

  // Upload foto nota (opsional) ke Storage: <org_id>/<YYYY-MM>/<waktu>-<nama>
  let receiptPath: string | null = null;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE) fail("Ukuran file nota maksimal 10 MB.");
    const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-60);
    receiptPath = `${org.id}/${date.slice(0, 7)}/${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from("receipts").upload(receiptPath, file, { contentType: file.type });
    if (error) fail(`Gagal upload nota: ${error.message}`);
  }

  const { error } = await supabase.from("transactions").insert({
    org_id: org.id,
    property_id: String(formData.get("property_id") || "") || null,
    category_id: categoryId,
    date,
    type: cat!.type,
    amount,
    description: String(formData.get("description") || "").trim() || null,
    payment_method: String(formData.get("payment_method") || "") || null,
    receipt_path: receiptPath,
    created_by: user.id,
  });
  if (error) {
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    fail(friendlyError(error));
  }

  revalidatePath("/", "layout");
  redirect(`${back}&message=${encodeURIComponent("Transaksi tersimpan.")}`);
}

export async function deleteTransaction(id: string, month: string) {
  const { supabase } = await getCurrentOrg();
  const { data: tx } = await supabase.from("transactions").select("receipt_path").eq("id", id).single();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) redirect(`/finance?month=${month}&error=${encodeURIComponent(friendlyError(error))}`);
  if (tx?.receipt_path) await supabase.storage.from("receipts").remove([tx.receipt_path]);
  revalidatePath("/", "layout");
  redirect(`/finance?month=${month}&message=${encodeURIComponent("Transaksi dihapus.")}`);
}
