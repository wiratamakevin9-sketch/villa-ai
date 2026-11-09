"use client";

import { useMemo, useState, useTransition } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { FIELDS, buildRows, guessMapping, type DateFormat, type Field } from "@/lib/csv-import";
import { formatIDR } from "@/lib/format";
import type { Channel, PropertyLite } from "@/lib/data";
import { importBookings, type ImportResult } from "./actions";

const SOURCES = [
  { channel: "Airbnb", hint: "Airbnb → Menu → Transaction history / Reservations → Export CSV. Format tanggal biasanya BB/HH/TTTT." },
  { channel: "Booking.com", hint: "Extranet → Reservations → pilih rentang tanggal → Download." },
  { channel: "Agoda", hint: "YCS → Bookings → Export." },
  { channel: "Direct / WhatsApp", hint: "Gunakan template CSV di bawah untuk booking langsung / WhatsApp." },
];

export function Importer({ properties, channels }: { properties: PropertyLite[]; channels: Channel[] }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [channel, setChannel] = useState("Airbnb");
  const [dateFormat, setDateFormat] = useState<DateFormat>("auto");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<Field, string>>>({});
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const rows = useMemo(
    () => buildRows(data, mapping, { dateFormat, defaultChannel: channel }),
    [data, mapping, dateFormat, channel],
  );
  const valid = rows.filter((r) => r.problems.length === 0);
  const missingRequired = FIELDS.filter((f) => f.required && !mapping[f.key]);

  function onFile(file: File) {
    setResults(null);
    setError("");
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const h = res.meta.fields ?? [];
        setHeaders(h);
        setData(res.data);
        setMapping(guessMapping(h));
        if (h.length === 0) setError("File tidak terbaca sebagai CSV.");
      },
      error: (e) => setError(e.message),
    });
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const payload = valid.map((r) => { const copy: Partial<typeof r> = { ...r }; delete copy.problems; return copy as Record<string, string | number | null>; });
      const res = await importBookings(propertyId, payload);
      if (res.error) setError(res.error);
      else setResults(res.results ?? []);
    });
  }

  const count = (s: ImportResult["status"]) => results?.filter((r) => r.status === s).length ?? 0;
  const source = SOURCES.find((s) => s.channel === channel);

  return (
    <div className="space-y-4">
      {/* Langkah 1 */}
      <div className="card space-y-4">
        <h2 className="font-semibold">1. Pilih villa, sumber, dan file</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="imp-prop">Villa tujuan</label>
            <select id="imp-prop" className="input" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="imp-ch">Sumber / channel</label>
            <select id="imp-ch" className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {channels.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="imp-df">Format tanggal di file</label>
            <select id="imp-df" className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}>
              <option value="auto">Otomatis (HH/BB/TTTT jika ragu)</option>
              <option value="DMY">HH/BB/TTTT (Indonesia/Eropa)</option>
              <option value="MDY">BB/HH/TTTT (Amerika, Airbnb)</option>
              <option value="YMD">TTTT-BB-HH</option>
            </select>
          </div>
        </div>
        {source && <p className="text-sm text-stone-500">💡 {source.hint}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-secondary cursor-pointer">
            Pilih file CSV
            <input type="file" accept=".csv,text/csv" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
          <span className="text-sm text-stone-500">{fileName || "Belum ada file"}</span>
          <a href="/template-booking.csv" download className="text-sm text-emerald-700 underline">Unduh template CSV</a>
        </div>
        <p className="text-xs text-stone-500">
          File Excel? Buka di Excel/Google Sheets lalu <b>Simpan sebagai / Download → CSV</b>.
          Harga dianggap dalam Rupiah.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Langkah 2 */}
      {headers.length > 0 && !results && (
        <div className="card space-y-4">
          <h2 className="font-semibold">2. Cocokkan kolom</h2>
          <p className="text-sm text-stone-500">Sudah ditebak otomatis. Periksa dan ubah jika ada yang salah.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label" htmlFor={`map-${f.key}`}>{f.label}{f.required && " *"}</label>
                <select id={`map-${f.key}`} className="input" value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}>
                  <option value="">— tidak ada —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Langkah 3 */}
      {headers.length > 0 && !results && (
        <div className="card space-y-3">
          <h2 className="font-semibold">3. Periksa lalu impor</h2>
          <p className="text-sm">
            {rows.length} baris terbaca · <span className="text-emerald-700">{valid.length} siap diimpor</span>
            {rows.length - valid.length > 0 && <> · <span className="text-red-700">{rows.length - valid.length} bermasalah (dilewati)</span></>}
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-stone-200">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-stone-50 text-left text-stone-500">
                <tr><th className="px-2 py-1">#</th><th>Tamu</th><th>Check-in</th><th>Check-out</th><th className="text-right">Harga</th><th className="text-right">Komisi</th><th>Kode</th><th className="px-2">Catatan</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={`border-t border-stone-100 ${r.problems.length ? "bg-red-50" : ""}`}>
                    <td className="px-2 py-1 text-stone-400">{i + 1}</td>
                    <td>{r.guest_name || "—"}</td>
                    <td>{r.check_in ?? "?"}</td>
                    <td>{r.check_out ?? "?"}</td>
                    <td className="text-right">{r.gross_amount != null ? formatIDR(r.gross_amount) : "?"}</td>
                    <td className="text-right">{r.commission_amount != null ? formatIDR(r.commission_amount) : "otomatis"}</td>
                    <td>{r.external_ref || "—"}</td>
                    <td className="px-2 text-red-700">{r.problems.join(", ") || (r.status === "cancelled" ? "dibatalkan" : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 200 && <p className="text-xs text-stone-500">Pratinjau menampilkan 200 baris pertama.</p>}
          {missingRequired.length > 0 && (
            <p className="text-sm text-amber-700">Kolom wajib belum dicocokkan: {missingRequired.map((f) => f.label).join(", ")}</p>
          )}
          <button className="btn" disabled={pending || valid.length === 0 || missingRequired.length > 0 || !propertyId} onClick={submit}>
            {pending ? "Mengimpor…" : `Impor ${valid.length} booking`}
          </button>
        </div>
      )}

      {/* Hasil */}
      {results && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Hasil impor</h2>
          <ul className="text-sm">
            <li>✅ Berhasil: <b>{count("ok")}</b></li>
            <li>↩️ Sudah ada (dilewati): <b>{count("duplicate")}</b></li>
            <li>⚠️ Bentrok tanggal: <b>{count("conflict")}</b></li>
            <li>❌ Gagal: <b>{count("error")}</b></li>
          </ul>
          {results.some((r) => r.status === "conflict" || r.status === "error") && (
            <ul className="max-h-48 overflow-auto text-xs text-red-700">
              {results.filter((r) => r.status === "conflict" || r.status === "error").map((r) => (
                <li key={r.row}>Baris {r.row} ({valid[r.row - 1]?.guest_name}, {valid[r.row - 1]?.check_in}): {r.message}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Link href="/bookings/calendar" className="btn">Lihat kalender</Link>
            <button className="btn-secondary" onClick={() => { setResults(null); setHeaders([]); setData([]); setFileName(""); }}>
              Impor file lain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
