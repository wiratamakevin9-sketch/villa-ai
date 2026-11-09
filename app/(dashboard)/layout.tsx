import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";

const NAV = [
  { href: "/", label: "Ringkasan" },
  { href: "/assistant", label: "✦ Asisten AI" },
  { href: "/bookings", label: "Booking" },
  { href: "/bookings/calendar", label: "Kalender" },
  { href: "/finance", label: "Keuangan" },
  { href: "/properties", label: "Villa" },
  { href: "/settings", label: "Pengaturan" },
];

// Menu berikutnya (Fase 3+): Alert, Laporan otomatis, Operasional

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { org, user, role } = await getCurrentOrg();

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-stone-200 bg-white md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-stone-400">Villa AI</p>
          <p className="truncate font-semibold">{org.name}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden p-4 text-xs text-stone-500 md:block">
          <p className="truncate">{user.email}</p>
          <p className="capitalize">{role}</p>
          <form action="/auth/signout" method="post" className="mt-2">
            <button className="text-emerald-700 underline">Keluar</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
