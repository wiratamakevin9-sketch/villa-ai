// Bantuan tanggal. Semua tanggal disimpan sebagai 'YYYY-MM-DD'.

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10); // bulan berikutnya
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: next, days };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function isValidMonth(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}$/.test(v);
}

export function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function monthLabel(month: string) {
  return new Date(month + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
