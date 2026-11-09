// Ubah array objek menjadi CSV (pemisah koma, aman untuk Excel & Google Sheets).
export function toCsv(rows: Record<string, unknown>[], opts: { bom?: boolean } = {}) {
  if (rows.length === 0) return opts.bom ? "﻿" : "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "object" ? JSON.stringify(v) : String(v);
    // cegah "formula injection" saat file dibuka di spreadsheet
    if (/^[=+\-@]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))];
  return (opts.bom ? "﻿" : "") + lines.join("\r\n") + "\r\n";
}
