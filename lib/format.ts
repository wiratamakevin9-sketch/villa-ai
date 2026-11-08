export function formatIDR(value: number | null | undefined, compact = false) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
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
