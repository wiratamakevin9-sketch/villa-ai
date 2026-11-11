import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { Flash } from "@/components/flash";
import { addTask, assignTask, completeTask, setTaskStatus } from "./actions";

const TYPE: Record<string, string> = { cleaning: "Cleaning", maintenance: "Maintenance", inspection: "Inspeksi", purchase: "Pembelian", other: "Lainnya" };
const PRIO: Record<string, string> = { urgent: "🔴 Mendesak", high: "🟠 Tinggi", normal: "Normal", low: "Rendah" };
type Task = {
  id: string; type: string; title: string; status: string; priority: string; due_at: string | null; notes: string | null;
  cost: number | null; assigned_to: string | null; auto_key: string | null; booking_id: string | null;
  properties: { name: string } | null; bookings: { check_in: string; guests: { name: string } | null } | null;
};
type Staff = { id: string; name: string; role: string | null; user_id: string | null; active: boolean };
type B = { id: string; check_in: string; check_out: string; guests_count: number | null; properties: { name: string } | null; guests: { name: string; phone: string | null } | null };

const wita = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
const fmtDue = (iso: string) => new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; who?: string; property?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const done = sp.show === "done";
  const { supabase, role, user } = await getCurrentOrg();
  const canManage = role !== "staff";
  const today = wita();
  const [{ properties }, { data: staffRows }] = await Promise.all([
    getLookups(supabase),
    supabase.from("staff").select("id, name, role, user_id, active").order("name"),
  ]);
  const staff = (staffRows ?? []) as Staff[];
  const me = staff.find((s) => s.user_id === user.id);
  const who = sp.who ?? (role === "staff" && me ? "me" : "all");

  let q = supabase.from("tasks")
    .select("id, type, title, status, priority, due_at, notes, cost, assigned_to, auto_key, booking_id, properties(name), bookings(check_in, guests(name))")
    .in("status", done ? ["done", "cancelled"] : ["todo", "in_progress"])
    .order("due_at", { ascending: !done, nullsFirst: false }).limit(150);
  if (sp.property) q = q.eq("property_id", sp.property);
  if (who === "me" && me) q = q.eq("assigned_to", me.id);
  else if (who === "none") q = q.is("assigned_to", null);
  else if (who !== "all" && who !== "me") q = q.eq("assigned_to", who);

  const [{ data }, { data: ins }, { data: outs }] = await Promise.all([
    q,
    supabase.from("bookings").select("id, check_in, check_out, guests_count, properties(name), guests(name, phone)")
      .eq("check_in", today).in("status", ["confirmed", "checked_in"]),
    supabase.from("bookings").select("id, check_in, check_out, guests_count, properties(name), guests(name, phone)")
      .eq("check_out", today).in("status", ["confirmed", "checked_in", "completed"]),
  ]);
  const tasks = (data ?? []) as unknown as Task[];
  const checkins = (ins ?? []) as unknown as B[];
  const checkouts = (outs ?? []) as unknown as B[];
  const now = Date.now();
  const dueToday = tasks.filter((t) => t.due_at && t.due_at.slice(0, 10) <= today && !done);
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.name ?? "—";
  const href = (p: Record<string, string | undefined>) => {
    const x = new URLSearchParams(); Object.entries({ show: sp.show, who, property: sp.property, ...p }).forEach(([k, v]) => v && x.set(k, v));
    return `/tasks?${x.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Operasional</h1>
        {role === "staff" && !me && <p className="text-sm text-amber-800">Akunmu belum dihubungkan ke data staf. Minta owner mengundang ulang dengan memilih nama staf.</p>}
      </div>
      <Flash error={sp.error} message={sp.message} />

      {/* Papan hari ini */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="card">
          <p className="text-sm text-stone-500">Check-in hari ini</p>
          <p className="text-2xl font-semibold">{checkins.length}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {checkins.map((b) => <li key={b.id}>{b.properties?.name} · {b.guests?.name ?? "Tamu"}{b.guests_count ? ` (${b.guests_count} org)` : ""}</li>)}
          </ul>
        </div>
        <div className="card">
          <p className="text-sm text-stone-500">Check-out hari ini</p>
          <p className="text-2xl font-semibold">{checkouts.length}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {checkouts.map((b) => <li key={b.id}>{b.properties?.name} · {b.guests?.name ?? "Tamu"}</li>)}
          </ul>
        </div>
        <div className="card">
          <p className="text-sm text-stone-500">Tugas hari ini & terlambat</p>
          <p className="text-2xl font-semibold">{dueToday.length}</p>
          <p className="mt-1 text-sm text-stone-500">{dueToday.filter((t) => t.priority === "high" || t.priority === "urgent").length} prioritas tinggi</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={href({ show: undefined })} className={!done ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Belum selesai</Link>
            <Link href={href({ show: "done" })} className={done ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Selesai</Link>
            <span className="text-stone-300">|</span>
            {me && <Link href={href({ who: "me" })} className={who === "me" ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Tugas saya</Link>}
            <Link href={href({ who: "all" })} className={who === "all" ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Semua</Link>
            <Link href={href({ who: "none" })} className={who === "none" ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Belum di-assign</Link>
            <form className="ml-auto flex gap-1">
              {sp.show && <input type="hidden" name="show" value={sp.show} />}
              <input type="hidden" name="who" value={who} />
              <select name="property" defaultValue={sp.property ?? ""} className="input w-auto py-1" aria-label="Villa">
                <option value="">Semua villa</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="btn-secondary px-3 py-1">Filter</button>
            </form>
          </div>

          {tasks.length === 0 ? <div className="card text-sm text-stone-500">Tidak ada tugas.</div> : (
            <ul className="space-y-2">
              {tasks.map((t) => {
                const overdue = !done && t.due_at && Date.parse(t.due_at) < now;
                return (
                  <li key={t.id} className="card space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-stone-500">
                          {TYPE[t.type]} · {t.properties?.name}{t.auto_key ? " · otomatis" : ""}
                          {t.priority !== "normal" && <> · {PRIO[t.priority]}</>}
                        </p>
                        <p className="font-medium">{t.title}</p>
                        {t.bookings && <p className="text-xs text-stone-500">Booking: {t.bookings.guests?.name ?? "Tamu"}</p>}
                        {t.notes && <p className="whitespace-pre-line text-xs text-stone-500">{t.notes}</p>}
                      </div>
                      <div className={`text-right text-sm ${overdue ? "font-medium text-red-700" : "text-stone-600"}`}>
                        {t.due_at ? fmtDue(t.due_at) : "Tanpa tenggat"}{overdue && <span className="block text-xs">terlambat</span>}
                        {done && t.cost ? <span className="block text-xs text-stone-500">biaya Rp {Number(t.cost).toLocaleString("id-ID")}</span> : null}
                      </div>
                    </div>
                    {!done && (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {canManage ? (
                          <form action={assignTask.bind(null, t.id)} className="flex items-center gap-1">
                            <select name="assigned_to" defaultValue={t.assigned_to ?? ""} className="input w-auto py-1" aria-label="Petugas">
                              <option value="">— belum di-assign —</option>
                              {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <button className="btn-secondary px-2 py-1 text-xs">Simpan</button>
                          </form>
                        ) : <span className="text-stone-500">Petugas: {staffName(t.assigned_to)}</span>}
                        <div className="ml-auto flex items-center gap-1">
                          {t.status === "todo" && <form action={setTaskStatus.bind(null, t.id, "in_progress")}><button className="btn-secondary px-2 py-1 text-xs">Mulai</button></form>}
                          {t.status === "in_progress" && <span className="text-xs text-sky-700">sedang dikerjakan</span>}
                          <form action={completeTask.bind(null, t.id)} className="flex items-center gap-1">
                            {canManage && <input name="cost" inputMode="numeric" placeholder="Biaya (opsional)" className="input w-36 py-1 text-xs" aria-label="Biaya" />}
                            <button className="btn px-2 py-1 text-xs">Selesai</button>
                          </form>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {canManage && (
          <div className="card h-fit">
            <h2 className="mb-3 font-semibold">Tambah tugas</h2>
            <form action={addTask} className="space-y-3">
              <div><label className="label" htmlFor="t-title">Tugas *</label><input id="t-title" name="title" className="input" required /></div>
              <div><label className="label" htmlFor="t-prop">Villa *</label>
                <select id="t-prop" name="property_id" className="input" required>{properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="t-type">Jenis</label>
                  <select id="t-type" name="type" className="input">{Object.entries(TYPE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="label" htmlFor="t-prio">Prioritas</label>
                  <select id="t-prio" name="priority" className="input" defaultValue="normal">{Object.entries(PRIO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div><label className="label" htmlFor="t-who">Petugas</label>
                <select id="t-who" name="assigned_to" className="input"><option value="">— belum di-assign —</option>
                  {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label" htmlFor="t-due">Tenggat</label><input id="t-due" name="due_date" type="date" className="input" /></div>
              <button className="btn w-full">Simpan</button>
            </form>
            <p className="mt-3 text-xs text-stone-500">Tugas cleaning dibuat otomatis dari booking; tugas servis dibuat otomatis dari jadwal aset (menu Villa).</p>
          </div>
        )}
      </div>
    </div>
  );
}
