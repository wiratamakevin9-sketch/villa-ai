// Unduh data sebagai CSV (dibuka langsung di Excel / Google Sheets). Memakai sesi login → aturan akses berlaku.
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const from = url.searchParams.get("from") || "2000-01-01";
  const to = url.searchParams.get("to") || "2100-01-01";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Harus login", { status: 401 });

  let rows: Record<string, unknown>[] = [];
  if (kind === "bookings") {
    const { data } = await supabase.from("bookings")
      .select("check_in, check_out, nights, status, gross_amount, commission_amount, net_amount, guests_count, external_ref, source, booked_at, properties(name), channels(name), guests(name, phone, country)")
      .gte("check_in", from).lt("check_in", to).order("check_in");
    type B = Record<string, unknown> & { properties: { name: string } | null; channels: { name: string } | null; guests: { name: string; phone: string | null; country: string | null } | null };
    rows = ((data ?? []) as unknown as B[]).map((b) => ({
      villa: b.properties?.name, tamu: b.guests?.name, telepon: b.guests?.phone, negara: b.guests?.country,
      channel: b.channels?.name, check_in: b.check_in, check_out: b.check_out, malam: b.nights,
      jumlah_tamu: b.guests_count, harga_kotor: b.gross_amount, komisi: b.commission_amount, bersih: b.net_amount,
      status: b.status, kode_ota: b.external_ref, sumber: b.source, dipesan: String(b.booked_at).slice(0, 10),
    }));
  } else if (kind === "transactions") {
    const { data } = await supabase.from("transactions")
      .select("date, type, amount, description, payment_method, categories(name), properties(name)")
      .gte("date", from).lt("date", to).order("date");
    type T = Record<string, unknown> & { categories: { name: string } | null; properties: { name: string } | null };
    rows = ((data ?? []) as unknown as T[]).map((t) => ({
      tanggal: t.date, jenis: t.type === "income" ? "pemasukan" : "pengeluaran", kategori: t.categories?.name,
      villa: t.properties?.name ?? "Bersama", jumlah: t.amount, keterangan: t.description, metode: t.payment_method,
    }));
  } else if (kind === "kpi") {
    const { data } = await supabase.from("v_monthly_kpi").select("*").gte("month", from).lt("month", to)
      .lte("month", new Date().toISOString().slice(0, 10)).order("month").order("property_name");
    rows = (data ?? []).map((k) => ({
      bulan: String(k.month).slice(0, 7), villa: k.property_name, malam_tersedia: k.available_nights,
      malam_terisi: k.occupied_nights, okupansi_pct: k.occupancy_pct, adr: k.adr, revpar: k.revpar,
      pendapatan_kamar: k.room_revenue, komisi: k.commission, pendapatan_lain: k.other_income,
      pengeluaran: k.expenses, laba_bersih: k.net_profit,
    }));
  } else {
    return new Response("Jenis tidak dikenal", { status: 400 });
  }

  const name = `villa-ai-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv(rows, { bom: true }), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
