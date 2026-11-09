// Logika impor CSV booking dari OTA. Dipisah agar mudah diuji dan dikembangkan.
// Format ekspor OTA bisa berubah sewaktu-waktu, jadi pemetaan kolom
// selalu bisa disesuaikan manual oleh user di layar impor.

export type Field =
  | "external_ref" | "guest_name" | "guest_phone" | "guest_email" | "guest_country"
  | "check_in" | "check_out" | "guests_count" | "gross_amount" | "commission_amount"
  | "status" | "channel_name";

export const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: "check_in", label: "Check-in", required: true },
  { key: "check_out", label: "Check-out", required: true },
  { key: "guest_name", label: "Nama tamu", required: true },
  { key: "gross_amount", label: "Total harga (sebelum komisi)", required: true },
  { key: "commission_amount", label: "Komisi" },
  { key: "external_ref", label: "Kode booking" },
  { key: "guests_count", label: "Jumlah tamu" },
  { key: "guest_phone", label: "Telepon" },
  { key: "guest_email", label: "Email" },
  { key: "guest_country", label: "Negara" },
  { key: "status", label: "Status" },
  { key: "channel_name", label: "Channel (jika campuran)" },
];

// Kata kunci nama kolom yang umum di ekspor Airbnb, Booking.com, Agoda, dan template kita.
const HINTS: Record<Field, string[]> = {
  external_ref: ["confirmation code", "book number", "booking number", "booking id", "reservation number", "reservation id", "kode booking", "kode konfirmasi"],
  guest_name: ["guest name", "booker name", "guest", "nama tamu", "customer name", "tamu", "name"],
  guest_phone: ["phone", "contact", "telepon", "no hp", "whatsapp"],
  guest_email: ["email"],
  guest_country: ["booker country", "country", "nationality", "negara"],
  check_in: ["check-in", "check in", "checkin", "start date", "arrival"],
  check_out: ["check-out", "check out", "checkout", "end date", "departure"],
  guests_count: ["# of guests", "guests", "persons", "people", "adults", "jumlah tamu"],
  gross_amount: ["gross earnings", "total price", "total amount", "price", "gross", "total", "harga", "amount", "earnings"],
  commission_amount: ["commission amount", "commission", "host service fee", "service fee", "komisi"],
  status: ["status"],
  channel_name: ["channel", "source", "sumber"],
};

const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();

export function guessMapping(headers: string[]): Partial<Record<Field, string>> {
  const used = new Set<string>();
  const out: Partial<Record<Field, string>> = {};
  for (const f of FIELDS) {
    for (const hint of HINTS[f.key]) {
      const exact = headers.find((h) => !used.has(h) && norm(h) === hint);
      const partial = exact ?? headers.find((h) => !used.has(h) && norm(h).includes(hint));
      if (partial) { out[f.key] = partial; used.add(partial); break; }
    }
  }
  return out;
}

export type DateFormat = "auto" | "YMD" | "DMY" | "MDY";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

/** Mengubah berbagai format tanggal menjadi 'YYYY-MM-DD'. Mengembalikan null jika tidak terbaca. */
export function parseDate(raw: string, fmt: DateFormat = "auto"): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const a = +m[1], b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let order = fmt;
    if (order === "auto" || order === "YMD") order = a > 12 ? "DMY" : b > 12 ? "MDY" : "DMY";
    return order === "MDY" ? iso(y, a, b) : iso(y, b, a);
  }
  const t = Date.parse(s); // mis. "Nov 8, 2026"
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

/** Mengubah "Rp 1.500.000", "1,500,000.00", "IDR 2500000" menjadi angka. */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? "").replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot > -1 && lastComma > -1) {
    // yang terakhir muncul adalah pemisah desimal
    s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1) {
    s = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  } else if (lastComma > -1) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : null;
}

export function parseStatus(raw: string): string {
  const s = norm(raw ?? "");
  if (/cancel|batal/.test(s)) return "cancelled";
  if (/no.?show/.test(s)) return "no_show";
  return ""; // kosong = ditentukan otomatis (selesai / terkonfirmasi)
}

export type ImportRow = {
  external_ref: string; guest_name: string; guest_phone: string; guest_email: string; guest_country: string;
  check_in: string | null; check_out: string | null; guests_count: string;
  gross_amount: number | null; commission_amount: number | null; status: string; channel_name: string;
  problems: string[];
};

export function buildRows(
  data: Record<string, string>[],
  mapping: Partial<Record<Field, string>>,
  opts: { dateFormat: DateFormat; defaultChannel: string },
): ImportRow[] {
  const get = (r: Record<string, string>, f: Field) => (mapping[f] ? String(r[mapping[f]!] ?? "").trim() : "");
  return data
    .filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== ""))
    .map((r) => {
      const row: ImportRow = {
        external_ref: get(r, "external_ref"),
        guest_name: get(r, "guest_name"),
        guest_phone: get(r, "guest_phone"),
        guest_email: get(r, "guest_email"),
        guest_country: get(r, "guest_country"),
        check_in: parseDate(get(r, "check_in"), opts.dateFormat),
        check_out: parseDate(get(r, "check_out"), opts.dateFormat),
        guests_count: get(r, "guests_count").replace(/[^\d]/g, ""),
        gross_amount: parseAmount(get(r, "gross_amount")),
        commission_amount: mapping.commission_amount ? parseAmount(get(r, "commission_amount")) : null,
        status: parseStatus(get(r, "status")),
        channel_name: get(r, "channel_name") || opts.defaultChannel,
        problems: [],
      };
      if (!row.check_in) row.problems.push("tanggal check-in tidak terbaca");
      if (!row.check_out) row.problems.push("tanggal check-out tidak terbaca");
      if (row.check_in && row.check_out && row.check_out <= row.check_in) row.problems.push("check-out harus setelah check-in");
      if (row.gross_amount === null) row.problems.push("harga tidak terbaca");
      return row;
    });
}
