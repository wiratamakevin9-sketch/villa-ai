"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="btn-secondary">Cetak / simpan PDF</button>;
}
