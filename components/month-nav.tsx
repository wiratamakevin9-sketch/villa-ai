import Link from "next/link";
import { monthLabel, shiftMonth } from "@/lib/dates";

// Navigasi bulan: ‹ November 2026 ›  — mempertahankan filter lain di URL.
export function MonthNav({
  month,
  basePath,
  params = {},
}: {
  month: string;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  const href = (m: string) => {
    const q = new URLSearchParams();
    Object.entries({ ...params, month: m }).forEach(([k, v]) => v && q.set(k, v));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <div className="flex items-center gap-2">
      <Link href={href(shiftMonth(month, -1))} className="btn-secondary px-3" aria-label="Bulan sebelumnya">‹</Link>
      <span className="min-w-36 text-center font-medium capitalize">{monthLabel(month)}</span>
      <Link href={href(shiftMonth(month, 1))} className="btn-secondary px-3" aria-label="Bulan berikutnya">›</Link>
    </div>
  );
}
