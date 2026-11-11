export function formatIDR(value: number | null | undefined, compact = false) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    // format singkat: 1 desimal (Rp 1,5 jt), format penuh: tanpa desimal (Rp 1.500.000)
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(n);
}

export function formatPct(value: number | null | undefined) {
  return value == null ? "–" : `${Number(value).toLocaleString("id-ID")}%`;
}

export function formatMonth(isoDate: string) {
  return new Date(isoDate + "T00:00:00").toLocaleDateString("id-ID", {
    month: "long",
    year: "numeric",
  });
}
