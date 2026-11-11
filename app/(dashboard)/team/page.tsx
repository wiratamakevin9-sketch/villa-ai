import { requireManager } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { formatIDR } from "@/lib/format";
import { Flash } from "@/components/flash";
import { addStaff, cancelInvite, changeRole, inviteMember, removeMember, updateStaff } from "./actions";

const ROLES = [
  ["housekeeping", "Housekeeping"], ["maintenance", "Maintenance / teknisi"], ["pool", "Kolam"],
  ["gardener", "Taman"], ["security", "Keamanan"], ["manager", "Manajer"], ["other", "Lainnya"],
];
type Staff = { id: string; name: string; role: string | null; phone: string | null; monthly_salary: number | null; property_id: string | null; active: boolean; user_id: string | null };
type Member = { user_id: string; full_name: string | null; email: string | null; role: string; joined_at: string };
type Invite = { id: string; email: string; role: string; created_at: string; accepted_at: string | null; staff_id: string | null };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, role, user } = await requireManager();
  const isOwner = role === "owner";
  const [{ properties }, { data: s }, { data: m }, { data: inv }] = await Promise.all([
    getLookups(supabase),
    supabase.from("staff").select("id, name, role, phone, monthly_salary, property_id, active, user_id").order("active", { ascending: false }).order("name"),
    supabase.rpc("team_members", { p_org: org.id }),
    isOwner ? supabase.from("org_invites").select("*").is("accepted_at", null).order("created_at") : Promise.resolve({ data: [] }),
  ]);
  const staff = (s ?? []) as Staff[];
  const members = (m ?? []) as Member[];
  const invites = (inv ?? []) as Invite[];
  const payroll = staff.filter((x) => x.active).reduce((a, x) => a + Number(x.monthly_salary ?? 0), 0);

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Tim</h1>
        <p className="text-sm text-stone-500">Data staf, penugasan villa, dan akses login. Total gaji staf aktif: {formatIDR(payroll)}/bulan.</p>
      </div>
      <Flash error={sp.error} message={sp.message} />

      {/* Staf */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Staf ({staff.filter((x) => x.active).length} aktif)</h2>
        <p className="text-sm text-stone-500">Tugas cleaning otomatis di-assign ke staf <b>housekeeping</b>, tugas servis aset ke staf <b>maintenance/kolam</b> — diutamakan yang ditugaskan di villa tersebut.</p>
        <ul className="divide-y divide-stone-100">
          {staff.map((x) => (
            <li key={x.id} className="py-3">
              <form action={updateStaff.bind(null, x.id)} className="grid items-end gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto_auto]">
                <div><label className="label text-xs">Nama</label><input name="name" defaultValue={x.name} className="input py-1" /></div>
                <div><label className="label text-xs">Peran</label>
                  <select name="role" defaultValue={x.role ?? "other"} className="input py-1">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="label text-xs">Villa</label>
                  <select name="property_id" defaultValue={x.property_id ?? ""} className="input py-1"><option value="">Semua villa</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div><label className="label text-xs">WhatsApp</label><input name="phone" defaultValue={x.phone ?? ""} className="input py-1" placeholder="0812…" /></div>
                <div><label className="label text-xs">Gaji/bulan</label><input name="monthly_salary" inputMode="numeric" defaultValue={x.monthly_salary ? Math.round(Number(x.monthly_salary)) : ""} className="input py-1" /></div>
                <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="active" defaultChecked={x.active} /> aktif</label>
                <button className="btn-secondary px-3 py-1 text-sm">Simpan</button>
              </form>
              {x.user_id && <p className="mt-1 text-xs text-emerald-700">✓ punya akses login</p>}
            </li>
          ))}
        </ul>
        <form action={addStaff} className="grid items-end gap-2 border-t border-stone-100 pt-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
          <div><label className="label text-xs" htmlFor="ns-name">Staf baru</label><input id="ns-name" name="name" className="input py-1" placeholder="Nama" required /></div>
          <div><label className="label text-xs" htmlFor="ns-role">Peran</label>
            <select id="ns-role" name="role" className="input py-1">{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label text-xs" htmlFor="ns-prop">Villa</label>
            <select id="ns-prop" name="property_id" className="input py-1"><option value="">Semua villa</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="label text-xs" htmlFor="ns-phone">WhatsApp</label><input id="ns-phone" name="phone" className="input py-1" placeholder="0812…" /></div>
          <button className="btn px-3 py-1">Tambah</button>
        </form>
      </div>

      {/* Akses login */}
      <div className="card space-y-3">
        <h2 className="font-semibold">Akses login</h2>
        <p className="text-sm text-stone-500">
          <b>Manager</b>: semua fitur kecuali pengaturan bisnis & tim. <b>Staf</b>: hanya Operasional, Booking, Kalender, Villa —
          tidak bisa melihat keuangan, laporan, harga, atau Asisten AI (dijaga di database).
        </p>
        <ul className="divide-y divide-stone-100 text-sm">
          {members.map((x) => (
            <li key={x.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{x.full_name ?? "—"} {x.email && <span className="text-stone-400">· {x.email}</span>}</span>
              {isOwner && x.user_id !== user.id && x.role !== "owner" ? (
                <div className="flex items-center gap-1">
                  <form action={changeRole.bind(null, x.user_id)} className="flex items-center gap-1">
                    <select name="role" defaultValue={x.role} className="input w-auto py-1" aria-label="Peran">
                      <option value="manager">Manager</option><option value="staff">Staf</option>
                    </select>
                    <button className="btn-secondary px-2 py-1 text-xs">Ubah</button>
                  </form>
                  <form action={removeMember.bind(null, x.user_id)}><button className="px-2 text-xs text-red-700 underline">Cabut akses</button></form>
                </div>
              ) : <span className="capitalize text-stone-500">{x.role}{x.user_id === user.id ? " (kamu)" : ""}</span>}
            </li>
          ))}
        </ul>

        {isOwner && (
          <>
            {invites.length > 0 && (
              <div className="rounded-lg bg-stone-50 p-3 text-sm">
                <p className="mb-1 font-medium">Undangan menunggu</p>
                {invites.map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 py-1">
                    <span>{i.email} · {i.role === "manager" ? "Manager" : "Staf"}{i.staff_id ? ` · ${staff.find((x) => x.id === i.staff_id)?.name ?? ""}` : ""}</span>
                    <form action={cancelInvite.bind(null, i.id)}><button className="text-xs text-red-700 underline">Batalkan</button></form>
                  </div>
                ))}
              </div>
            )}
            <form action={inviteMember} className="grid items-end gap-2 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
              <div><label className="label text-xs" htmlFor="inv-email">Undang lewat email</label><input id="inv-email" name="email" type="email" className="input py-1" placeholder="nama@email.com" required /></div>
              <div><label className="label text-xs" htmlFor="inv-role">Sebagai</label>
                <select id="inv-role" name="role" className="input py-1"><option value="staff">Staf</option><option value="manager">Manager</option></select></div>
              <div><label className="label text-xs" htmlFor="inv-staff">Data staf</label>
                <select id="inv-staff" name="staff_id" className="input py-1"><option value="">— tidak ada —</option>
                  {staff.filter((x) => !x.user_id && x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <button className="btn px-3 py-1">Undang</button>
            </form>
            <p className="text-xs text-stone-500">Cara bergabung: orang yang diundang membuka aplikasi → Daftar dengan email yang sama → konfirmasi email → klik <b>Gabung</b>.</p>
          </>
        )}
      </div>
    </div>
  );
}
