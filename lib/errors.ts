// Mengubah error database menjadi pesan yang mudah dipahami.
type DbError = { code?: string; message: string } | null;

export function friendlyError(error: DbError) {
  if (!error) return "";
  switch (error.code) {
    case "23P01":
      return "Tanggal bentrok dengan booking lain di villa ini.";
    case "23514":
      return "Data tidak valid. Pastikan tanggal check-out setelah check-in dan angka tidak negatif.";
    case "23505":
      return "Data dengan nama yang sama sudah ada.";
    case "42501":
      return "Kamu tidak punya izin untuk tindakan ini.";
    default:
      return error.message;
  }
}

export function parseRupiah(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[^\d]/g, "");
  return s === "" ? null : Number(s);
}
