import Link from "next/link";
import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { Flash } from "@/components/flash";
import { addTask, setTaskStatus } from "./actions";

const TYPE: Record<string, string> = { cleaning: "Cleaning", maintenance: "Maintenance", inspection: "Inspeksi", purchase: "Pembelian", other: "Lainnya" };
const PRIO: Record<string, string> = { urgent: "🔴 Mendesak", high: "🟠 Tinggi", normal: "Normal", low: "Rendah" };
type Task = { id: string; type: string; title: string; status: string; priority: string; due_at: string | null; notes: string | null; properties: { name: string } | null };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  const done = sp.show === "done";
  const { supabase, role } = await getCurrentOrg();
  const { properties } = await getLookups(supabase);
  const { data } = await supabase.from("tasks")
    .select("id, type, title, status, priority, due_at, notes, properties(name)")
    .in("status", done ? ["done", "cancelled"] : ["todo", "in_progress"])
    .order("due_at", { ascending: !done, nullsFirst: false }).limit(100);
  const tasks = (data ?? []) as unknown as Task[];
  const now = Date.now();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        <h1 className="text-2xl font-semibold">Operasional</h1>
        <Flash error={sp.error} message={sp.message} />
        <div className="flex gap-3 text-sm">
          <Link href="/tasks" className={!done ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Belum selesai</Link>
          <Link href="/tasks?show=done" className={done ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Selesai</Link>
        </div>
        <div className="card overflow-x-auto p-0">
          {tasks.length === 0 ? <p className="p-5 text-sm text-stone-500">Tidak ada tugas.</p> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-stone-50 text-left text-stone-500"><tr><th className="px-4 py-2">Tenggat</th><th>Tugas</th><th>Villa</th><th>Prioritas</th><th className="px-4"></th></tr></thead>
              <tbody>
                {tasks.map((t) => {
                  const overdue = !done && t.due_at && Date.parse(t.due_at) < now;
                  return (
                    <tr key={t.id} className="border-t border-stone-100 align-top">
                      <td className={`whitespace-nowrap px-4 py-2 ${overdue ? "font-medium text-red-700" : ""}`}>
                        {t.due_at ? new Date(t.due_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—"}{overdue && " · terlambat"}
                      </td>
                      <td><span className="text-xs text-stone-500">{TYPE[t.type]}</span><br />{t.title}{t.notes && <span className="block whitespace-pre-line text-xs text-stone-500">{t.notes}</span>}</td>
                      <td>{t.properties?.name}</td>
                      <td>{PRIO[t.priority]}</td>
                      <td className="px-4 text-right">
                        {!done && (
                          <div className="flex justify-end gap-1">
                            {t.status === "todo" && <form action={setTaskStatus.bind(null, t.id, "in_progress")}><button className="btn-secondary px-2 py-1 text-xs">Mulai</button></form>}
                            <form action={setTaskStatus.bind(null, t.id, "done")}><button className="btn px-2 py-1 text-xs">Selesai</button></form>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {role !== "staff" && (
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
            <div><label className="label" htmlFor="t-due">Tenggat</label><input id="t-due" name="due_date" type="date" className="input" /></div>
            <button className="btn w-full">Simpan</button>
          </form>
        </div>
      )}
    </div>
  );
}
