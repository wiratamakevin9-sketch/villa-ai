import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";

// staff: true = menu juga terlihat oleh staf (staf tidak melihat data keuangan & AI)
const NAV: { href: string; label: string; badge?: "alerts" | "approvals"; staff?: boolean }[] = [
  { href: "/", label: "Ringkasan" },
  { href: "/assistant", label: "✦ Asisten AI" },
  { href: "/alerts", label: "Alert", badge: "alerts" },
  { href: "/approvals", label: "Persetujuan", badge: "approvals" },
  { href: "/reports", label: "Laporan" },
  { href: "/tasks", label: "Operasional", staff: true },
  { href: "/bookings", label: "Booking", staff: true },
  { href: "/bookings/calendar", label: "Kalender", staff: true },
  { href: "/pricing", label: "Harga" },
  { href: "/finance", label: "Keuangan" },
  { href: "/properties", label: "Villa", staff: true },
  { href: "/team", label: "Tim" },
  { href: "/settings", label: "Pengaturan" },
];


export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, user, role } = await getCurrentOrg();
  const [{ count: openAlerts }, { count: pendingApprovals }] = await Promise.all([
    supabase.from("alerts").select("id", { count: "exact", head: true }).eq("status", "open").in("severity", ["warning", "critical"]),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const badges = { alerts: openAlerts ?? 0, approvals: pendingApprovals ?? 0 };

  return (
    <div className="min-h-screen md:flex">
      <aside className="print:hidden border-b border-stone-200 bg-white md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-stone-400">Villa AI</p>
          <p className="truncate font-semibold">{org.name}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">
          {NAV.filter((item) => role !== "staff" || item.staff).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
            >
              {item.label}
              {item.badge && badges[item.badge] > 0 && (
                <span className="ml-1.5 rounded-full bg-stone-800 px-1.5 py-0.5 text-xs text-white" aria-label={`${badges[item.badge]} menunggu`}>
                  {badges[item.badge]}
                </span>
              )}
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
