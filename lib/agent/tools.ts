// =====================================================================
// Tool data untuk Asisten AI Villa.
// ---------------------------------------------------------------------
// Prinsip:
//  * Semua tool HANYA MEMBACA data (Fase 2). Aksi yang mengubah data
//    akan lewat antrean persetujuan di fase berikutnya.
//  * Semua angka dihitung di sini / di SQL. AI hanya membaca hasilnya.
//  * Tool berjalan memakai koneksi Supabase milik user yang login,
//    sehingga aturan keamanan (RLS) tetap berlaku: AI tidak bisa
//    melihat data bisnis lain.
// =====================================================================
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { proposeAction } from "@/lib/approvals";

type Json = Record<string, unknown>;
type Executor = (supabase: SupabaseClient, input: unknown) => Promise<Json>;

const month = z.string().regex(/^\d{4}-\d{2}$/, "format YYYY-MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format YYYY-MM-DD");
const uuid = z.string().uuid();
const toDate = (m: string) => `${m}-01`;
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const num = (v: unknown) => Number(v ?? 0);

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Definisi tool (yang dilihat AI)
// ---------------------------------------------------------------------
const MONTH_RANGE = {
  from_month: { type: "string", description: "Bulan awal, format YYYY-MM" },
  to_month: { type: "string", description: "Bulan akhir (inklusif), format YYYY-MM" },
  property_id: { type: "string", description: "Opsional: ID villa. Kosongkan untuk semua villa." },
} as const;

export const TOOL_DEFINITIONS: Anthropic.Beta.Messages.BetaToolUnion[] = [
  {
    name: "get_portfolio_overview",
    description:
      "Daftar semua villa (ID, nama, lokasi, kamar, harga dasar, nilai investasi, tanggal buka, status) dan channel penjualan beserta % komisinya. Panggil ini dulu jika perlu ID villa.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_monthly_kpi",
    description:
      "KPI bulanan per villa: malam tersedia & terisi, okupansi %, ADR, RevPAR, pendapatan kamar, komisi, pendapatan lain, pengeluaran, laba bersih. Juga total per villa untuk seluruh periode dan biaya bersama (tidak terikat villa) per bulan. Bulan berjalan masih parsial.",
    input_schema: { type: "object", properties: MONTH_RANGE, required: ["from_month", "to_month"], additionalProperties: false },
  },
  {
    name: "get_forward_occupancy",
    description: "Okupansi yang sudah dipesan untuk 30, 60, dan 90 hari ke depan per villa (booking pace).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_channel_performance",
    description:
      "Performa per channel (Airbnb, Booking.com, Agoda, Direct/WhatsApp, dll.) dalam rentang bulan: jumlah booking, malam, pendapatan kotor, komisi, pendapatan bersih, dan porsi %.",
    input_schema: { type: "object", properties: MONTH_RANGE, required: ["from_month", "to_month"], additionalProperties: false },
  },
  {
    name: "get_expense_breakdown",
    description:
      "Rincian pengeluaran per kategori dalam rentang bulan (total, rata-rata per bulan, dan per bulan), termasuk biaya bersama jika property_id dikosongkan.",
    input_schema: { type: "object", properties: MONTH_RANGE, required: ["from_month", "to_month"], additionalProperties: false },
  },
  {
    name: "find_expense_anomalies",
    description:
      "Cari pengeluaran tidak wajar: kategori per villa per bulan yang nilainya jauh di atas rata-rata 3 bulan sebelumnya.",
    input_schema: {
      type: "object",
      properties: {
        min_ratio: { type: "number", description: "Ambang rasio terhadap rata-rata (default 1.5 = 50% di atas rata-rata)" },
        from_month: { type: "string", description: "Opsional: hanya bulan >= ini, format YYYY-MM" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_bookings",
    description:
      "Daftar booking yang menginap dalam rentang tanggal (maks 100): tamu, negara, villa, channel, tanggal, malam, nilai kotor/bersih, status, dan tanggal pemesanan (lead time).",
    input_schema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "YYYY-MM-DD" },
        to_date: { type: "string", description: "YYYY-MM-DD (eksklusif)" },
        property_id: { type: "string", description: "Opsional: ID villa" },
        status: {
          type: "string",
          enum: ["inquiry", "confirmed", "checked_in", "completed", "cancelled", "no_show"],
          description: "Opsional: filter status",
        },
      },
      required: ["from_date", "to_date"],
      additionalProperties: false,
    },
  },
  {
    name: "get_roi",
    description:
      "ROI per villa untuk 12 bulan penuh terakhir: laba bersih, biaya bersama yang dibagi rata ke villa aktif, ROI tahunan % terhadap nilai investasi, dan perkiraan masa balik modal (tahun).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

// --- Fase 3: alert & usulan aksi (masuk antrean persetujuan, TIDAK langsung dijalankan) ---
TOOL_DEFINITIONS.push(
  {
    name: "get_open_alerts",
    description: "Daftar alert yang masih terbuka (okupansi rendah, pengeluaran tidak wajar, penurunan okupansi, rugi, celah booking, servis aset) beserta data pemicunya.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "propose_task",
    description:
      "USULKAN tugas operasional (maintenance, inspeksi, pembelian, cleaning) untuk sebuah villa. Tugas TIDAK langsung dibuat: masuk antrean persetujuan pemilik. Gunakan hanya jika pengguna meminta atau setuju dengan saranmu.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "ID villa (dari get_portfolio_overview)" },
        type: { type: "string", enum: ["cleaning", "maintenance", "inspection", "purchase", "other"] },
        title: { type: "string", description: "Judul tugas yang jelas, mis. 'Servis pompa kolam & cek tekanan air'" },
        due_date: { type: "string", description: "Opsional, YYYY-MM-DD" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        notes: { type: "string", description: "Opsional: detail pekerjaan" },
        reason: { type: "string", description: "Alasan berbasis data, ditampilkan ke pemilik saat menyetujui" },
      },
      required: ["property_id", "type", "title", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_base_rate_change",
    description:
      "USULKAN perubahan harga dasar per malam sebuah villa (Rupiah). TIDAK langsung diubah: masuk antrean persetujuan pemilik. Sertakan alasan berbasis data (okupansi, ADR, kompetitor, musim).",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string", description: "ID villa" },
        new_rate: { type: "integer", description: "Harga dasar baru per malam dalam Rupiah, mis. 3500000" },
        reason: { type: "string", description: "Alasan berbasis data" },
      },
      required: ["property_id", "new_rate", "reason"],
      additionalProperties: false,
    },
  },
);

// Tool web search bawaan Claude (riset kompetitor, harga pasar, tren pariwisata)
export const WEB_SEARCH_TOOL: Anthropic.Beta.Messages.BetaToolUnion = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
  user_location: { type: "approximate", country: "ID", region: "Bali", timezone: "Asia/Makassar" },
};

// Label yang ditampilkan di UI saat tool berjalan
export const TOOL_LABELS: Record<string, string> = {
  get_portfolio_overview: "Membaca daftar villa",
  get_monthly_kpi: "Menghitung KPI bulanan",
  get_forward_occupancy: "Mengecek okupansi ke depan",
  get_channel_performance: "Menganalisis channel penjualan",
  get_expense_breakdown: "Merinci pengeluaran",
  find_expense_anomalies: "Mencari pengeluaran tidak wajar",
  list_bookings: "Membaca daftar booking",
  get_roi: "Menghitung ROI",
  web_search: "Mencari di web",
  get_open_alerts: "Membaca alert terbuka",
  propose_task: "Mengusulkan tugas",
  propose_base_rate_change: "Mengusulkan perubahan harga",
};

// ---------------------------------------------------------------------
// Pelaksana tool
// ---------------------------------------------------------------------
const RangeInput = z.object({ from_month: month, to_month: month, property_id: uuid.optional() }).strict();

const executors: Record<string, Executor> = {
  async get_portfolio_overview(supabase) {
    const [p, c] = await Promise.all([
      supabase.from("properties")
        .select("id, name, code, location, bedrooms, bathrooms, max_guests, base_rate, purchase_price, opening_date, status, notes")
        .order("name"),
      supabase.from("channels").select("name, type, commission_pct, active").order("name"),
    ]);
    fail(p.error); fail(c.error);
    return {
      properties: (p.data ?? []).map(({ notes, ...r }) => ({ ...r, is_demo_data: notes === "[DEMO]" })),
      channels: c.data,
    };
  },

  async get_monthly_kpi(supabase, input) {
    const a = RangeInput.parse(input);
    let q = supabase.from("v_monthly_kpi").select("*")
      .gte("month", toDate(a.from_month)).lte("month", toDate(a.to_month))
      .order("property_name").order("month");
    if (a.property_id) q = q.eq("property_id", a.property_id);
    const [{ data, error }, shared] = await Promise.all([
      q,
      supabase.from("v_monthly_shared_expenses").select("month, shared_expenses")
        .gte("month", toDate(a.from_month)).lte("month", toDate(a.to_month)).order("month"),
    ]);
    fail(error); fail(shared.error);
    const rows = (data ?? []).map((r) => ({
      property: r.property_name, property_id: r.property_id, month: String(r.month).slice(0, 7),
      available_nights: r.available_nights, occupied_nights: r.occupied_nights, occupancy_pct: num(r.occupancy_pct),
      adr: num(r.adr), revpar: num(r.revpar), room_revenue: round(num(r.room_revenue)), commission: round(num(r.commission)),
      other_income: num(r.other_income), expenses: num(r.expenses), net_profit: round(num(r.net_profit)),
    }));
    // Total per villa untuk seluruh periode (dihitung di kode, bukan oleh AI)
    const totals = Object.values(rows.reduce<Record<string, Json & { _a: number; _o: number; _rev: number; _np: number; _exp: number; _com: number }>>((acc, r) => {
      const t = (acc[r.property_id] ??= { property: r.property, _a: 0, _o: 0, _rev: 0, _np: 0, _exp: 0, _com: 0 });
      t._a += r.available_nights; t._o += r.occupied_nights; t._rev += r.room_revenue;
      t._np += r.net_profit; t._exp += r.expenses; t._com += r.commission;
      return acc;
    }, {})).map((t) => ({
      property: t.property, available_nights: t._a, occupied_nights: t._o,
      occupancy_pct: t._a ? round((100 * t._o) / t._a, 1) : null,
      adr: t._o ? round(t._rev / t._o) : null, revpar: t._a ? round(t._rev / t._a) : null,
      room_revenue: round(t._rev), commission: round(t._com), expenses: round(t._exp), net_profit: round(t._np),
    }));
    return {
      period: `${a.from_month} s/d ${a.to_month}`,
      current_month: new Date().toISOString().slice(0, 7),
      note: "Bulan berjalan masih parsial (booking & pengeluaran belum lengkap). net_profit per villa BELUM dikurangi biaya bersama.",
      monthly: rows,
      totals_per_property: totals,
      shared_expenses_per_month: (shared.data ?? []).map((s) => ({ month: String(s.month).slice(0, 7), amount: num(s.shared_expenses) })),
    };
  },

  async get_forward_occupancy(supabase) {
    const { data, error } = await supabase.from("v_forward_occupancy")
      .select("property_name, horizon_days, booked_nights, occupancy_pct").order("property_name").order("horizon_days");
    fail(error);
    return { as_of: new Date().toISOString().slice(0, 10), rows: data };
  },

  async get_channel_performance(supabase, input) {
    const a = RangeInput.parse(input);
    let q = supabase.from("v_channel_performance").select("*")
      .gte("month", toDate(a.from_month)).lte("month", toDate(a.to_month));
    if (a.property_id) q = q.eq("property_id", a.property_id);
    const { data, error } = await q;
    fail(error);
    const agg = new Map<string, { channel: string; type: string; nights: number; bookings: number; gross: number; commission: number; net: number }>();
    for (const r of data ?? []) {
      const t = agg.get(r.channel_name) ?? { channel: r.channel_name, type: r.channel_type, nights: 0, bookings: 0, gross: 0, commission: 0, net: 0 };
      t.nights += num(r.nights); t.bookings += num(r.bookings); t.gross += num(r.gross_revenue);
      t.commission += num(r.commission); t.net += num(r.net_revenue);
      agg.set(r.channel_name, t);
    }
    const list = [...agg.values()].sort((x, y) => y.gross - x.gross);
    const totalGross = list.reduce((s, x) => s + x.gross, 0);
    const totalNights = list.reduce((s, x) => s + x.nights, 0);
    return {
      period: `${a.from_month} s/d ${a.to_month}`,
      note: "bookings = jumlah booking yang punya malam di periode ini (booking lintas bulan bisa terhitung di 2 bulan).",
      channels: list.map((x) => ({
        ...x, gross: round(x.gross), commission: round(x.commission), net: round(x.net),
        revenue_share_pct: totalGross ? round((100 * x.gross) / totalGross, 1) : 0,
        nights_share_pct: totalNights ? round((100 * x.nights) / totalNights, 1) : 0,
        effective_commission_pct: x.gross ? round((100 * x.commission) / x.gross, 1) : 0,
        adr: x.nights ? round(x.gross / x.nights) : null,
      })),
    };
  },

  async get_expense_breakdown(supabase, input) {
    const a = RangeInput.parse(input);
    const [y, m] = a.to_month.split("-").map(Number);
    const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    let q = supabase.from("transactions")
      .select("date, amount, property_id, categories(name, group_name), properties(name)")
      .eq("type", "expense").gte("date", toDate(a.from_month)).lt("date", end);
    if (a.property_id) q = q.eq("property_id", a.property_id);
    const { data, error } = await q;
    fail(error);
    type Row = { date: string; amount: number; property_id: string | null; categories: { name: string; group_name: string | null } | null };
    const rows = (data ?? []) as unknown as Row[];
    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
    const byCat = new Map<string, { category: string; group: string | null; total: number; per_month: Record<string, number> }>();
    for (const r of rows) {
      const name = r.categories?.name ?? "Lainnya";
      const t = byCat.get(name) ?? { category: name, group: r.categories?.group_name ?? null, total: 0, per_month: {} };
      t.total += num(r.amount);
      const mm = r.date.slice(0, 7);
      t.per_month[mm] = (t.per_month[mm] ?? 0) + num(r.amount);
      byCat.set(name, t);
    }
    const total = rows.reduce((s, r) => s + num(r.amount), 0);
    return {
      period: `${a.from_month} s/d ${a.to_month}`,
      months_with_data: months,
      total_expenses: round(total),
      shared_expenses_included: !a.property_id,
      shared_expenses_total: round(rows.filter((r) => !r.property_id).reduce((s, r) => s + num(r.amount), 0)),
      categories: [...byCat.values()].sort((x, y2) => y2.total - x.total).map((c) => ({
        ...c, total: round(c.total), share_pct: total ? round((100 * c.total) / total, 1) : 0,
        avg_per_month: months.length ? round(c.total / months.length) : 0,
      })),
    };
  },

  async find_expense_anomalies(supabase, input) {
    const a = z.object({ min_ratio: z.number().min(1).max(20).optional(), from_month: month.optional() }).strict().parse(input ?? {});
    const ratio = a.min_ratio ?? 1.5;
    let q = supabase.from("v_expense_baseline").select("*").gte("ratio_vs_avg", ratio).order("ratio_vs_avg", { ascending: false }).limit(30);
    if (a.from_month) q = q.gte("month", toDate(a.from_month));
    const [{ data, error }, props] = await Promise.all([q, supabase.from("properties").select("id, name")]);
    fail(error); fail(props.error);
    const name = (id: string | null) => props.data?.find((p) => p.id === id)?.name ?? "Biaya bersama";
    return {
      threshold: `>= ${ratio}x rata-rata 3 bulan sebelumnya`,
      anomalies: (data ?? []).map((r) => ({
        property: name(r.property_id), category: r.category_name, month: String(r.month).slice(0, 7),
        amount: num(r.amount), avg_prev_3_months: num(r.avg_prev_3_months), ratio: num(r.ratio_vs_avg),
        excess_amount: round(num(r.amount) - num(r.avg_prev_3_months)),
      })),
    };
  },

  async list_bookings(supabase, input) {
    const a = z.object({
      from_date: date, to_date: date, property_id: uuid.optional(),
      status: z.enum(["inquiry", "confirmed", "checked_in", "completed", "cancelled", "no_show"]).optional(),
    }).strict().parse(input);
    let q = supabase.from("bookings")
      .select("check_in, check_out, nights, status, gross_amount, commission_amount, net_amount, guests_count, booked_at, source, guests(name, country), channels(name), properties(name)")
      .lt("check_in", a.to_date).gt("check_out", a.from_date).order("check_in").limit(100);
    if (a.property_id) q = q.eq("property_id", a.property_id);
    if (a.status) q = q.eq("status", a.status);
    const { data, error } = await q;
    fail(error);
    type B = { check_in: string; check_out: string; nights: number; status: string; gross_amount: number; commission_amount: number; net_amount: number; guests_count: number | null; booked_at: string; source: string; guests: { name: string; country: string | null } | null; channels: { name: string } | null; properties: { name: string } | null };
    const rows = (data ?? []) as unknown as B[];
    return {
      count: rows.length,
      truncated: rows.length === 100,
      bookings: rows.map((b) => ({
        property: b.properties?.name, guest: b.guests?.name, country: b.guests?.country, channel: b.channels?.name ?? null,
        check_in: b.check_in, check_out: b.check_out, nights: b.nights, guests_count: b.guests_count, status: b.status,
        gross: num(b.gross_amount), commission: num(b.commission_amount), net: num(b.net_amount),
        lead_time_days: Math.round((Date.parse(b.check_in) - Date.parse(b.booked_at.slice(0, 10))) / 86_400_000),
      })),
    };
  },

  async get_roi(supabase) {
    // 12 bulan penuh terakhir (tidak termasuk bulan berjalan)
    const now = new Date();
    const endM = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const startM = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 12, 1));
    const s = startM.toISOString().slice(0, 10), e = endM.toISOString().slice(0, 10);
    const [k, sh, p] = await Promise.all([
      supabase.from("v_monthly_kpi").select("property_id, property_name, month, net_profit").gte("month", s).lt("month", e),
      supabase.from("v_monthly_shared_expenses").select("shared_expenses").gte("month", s).lt("month", e),
      supabase.from("properties").select("id, name, purchase_price, status").eq("status", "active"),
    ]);
    fail(k.error); fail(sh.error); fail(p.error);
    const props = p.data ?? [];
    const sharedTotal = (sh.data ?? []).reduce((acc, r) => acc + num(r.shared_expenses), 0);
    const sharedPer = props.length ? sharedTotal / props.length : 0;
    return {
      period: `${s.slice(0, 7)} s/d ${new Date(endM.getTime() - 86_400_000).toISOString().slice(0, 7)}`,
      note: "Jika data kurang dari 12 bulan, ROI tahunan diproyeksikan dari bulan yang ada (months_of_data).",
      shared_expenses_total: round(sharedTotal),
      properties: props.map((pr) => {
        const rows = (k.data ?? []).filter((r) => r.property_id === pr.id);
        const months = rows.length;
        const profit = rows.reduce((acc, r) => acc + num(r.net_profit), 0) - sharedPer;
        const annual = months ? (profit / months) * 12 : 0;
        const invest = num(pr.purchase_price);
        return {
          property: pr.name, months_of_data: months, investment: invest || null,
          net_profit_after_shared: round(profit), annualized_profit: round(annual),
          roi_pct: invest ? round((100 * annual) / invest, 1) : null,
          payback_years: invest && annual > 0 ? round(invest / annual, 1) : null,
        };
      }),
    };
  },

  async get_open_alerts(supabase) {
    const { data, error } = await supabase.from("alerts")
      .select("type, severity, title, data, created_at, properties(name)")
      .eq("status", "open").order("created_at", { ascending: false }).limit(30);
    fail(error);
    return { count: data?.length ?? 0, alerts: data };
  },

  async propose_task(supabase, input) {
    const { reason, ...payload } = z.object({ reason: z.string().min(3).max(1000) }).passthrough().parse(input) as { reason: string } & Json;
    const r = await proposeAction(supabase, "create_task", payload, reason);
    return { ...r, message: "Usulan masuk antrean persetujuan. Pemilik bisa menyetujui di menu Persetujuan." };
  },

  async propose_base_rate_change(supabase, input) {
    const { reason, ...payload } = z.object({ reason: z.string().min(3).max(1000) }).passthrough().parse(input) as { reason: string } & Json;
    const r = await proposeAction(supabase, "update_base_rate", payload, reason);
    return { ...r, message: "Usulan masuk antrean persetujuan. Harga belum berubah sampai disetujui." };
  },
};

/** Menjalankan tool; error dikembalikan sebagai pesan agar AI bisa memperbaiki permintaannya. */
export async function runTool(supabase: SupabaseClient, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const exec = executors[name];
  if (!exec) return { content: `Tool tidak dikenal: ${name}`, isError: true };
  try {
    return { content: JSON.stringify(await exec(supabase, input)), isError: false };
  } catch (e) {
    const msg = e instanceof z.ZodError
      ? `Input tidak valid: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
      : e instanceof Error ? e.message : String(e);
    return { content: msg, isError: true };
  }
}
