import Link from "next/link";

export function BookingTabs({ active }: { active: "list" | "calendar" | "import" }) {
  const tabs = [
    { key: "list", href: "/bookings", label: "Daftar" },
    { key: "calendar", href: "/bookings/calendar", label: "Kalender" },
    { key: "import", href: "/bookings/import", label: "Impor CSV" },
  ];
  return (
    <div className="flex gap-1 border-b border-stone-200">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            t.key === active ? "border-emerald-700 font-medium text-emerald-800" : "border-transparent text-stone-500"
          }`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
