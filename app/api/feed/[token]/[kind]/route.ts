// Feed CSV untuk Google Sheets: =IMPORTDATA("https://<app>/api/feed/<token>/kpi.csv")
// Tanpa login — akses ditentukan oleh token rahasia (bisa diganti/dicabut di Pengaturan).
import { createClient } from "@supabase/supabase-js";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// Urutan kolom tetap (JSON dari database tidak menyimpan urutan)
const COLUMNS: Record<string, string[]> = {
  kpi: ["bulan", "villa", "malam_tersedia", "malam_terisi", "okupansi_pct", "adr", "revpar", "pendapatan_kamar", "komisi", "pendapatan_lain", "pengeluaran", "laba_bersih"],
  bookings: ["villa", "tamu", "negara", "channel", "check_in", "check_out", "malam", "jumlah_tamu", "harga_kotor", "komisi", "bersih", "status", "kode_ota", "dipesan"],
  transactions: ["tanggal", "jenis", "kategori", "villa", "jumlah", "keterangan", "metode"],
};

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; kind: string }> }) {
  const { token, kind } = await params;
  const k = kind.replace(/\.csv$/, "");
  if (!["kpi", "bookings", "transactions"].includes(k) || !/^[0-9a-f]{48}$/.test(token)) {
    return new Response("Tidak ditemukan", { status: 404 });
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.rpc("export_feed", { p_token: token, p_kind: k });
  if (error) return new Response("Token tidak valid atau sudah dicabut", { status: 403 });
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => Object.fromEntries(COLUMNS[k].map((c) => [c, r[c]])));
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
