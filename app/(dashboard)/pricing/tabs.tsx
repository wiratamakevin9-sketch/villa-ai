import Link from "next/link";

export function PricingTabs({ active, property }: { active: "calendar" | "competitors"; property?: string }) {
  const q = property ? `?property=${property}` : "";
  const tabs = [
    { key: "calendar", href: `/pricing${q}`, label: "Kalender harga & rekomendasi" },
    { key: "competitors", href: `/pricing/competitors${q}`, label: "Kompetitor & riset pasar" },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-stone-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${t.key === active ? "border-emerald-700 font-medium text-emerald-800" : "border-transparent text-stone-500"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
