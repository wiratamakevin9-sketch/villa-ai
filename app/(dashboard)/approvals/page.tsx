import { getCurrentOrg } from "@/lib/org";
import { formatIDR } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/approvals";
import { Flash } from "@/components/flash";
import { decide } from "./actions";

type Approval = {
  id: string; action_type: string; payload: Record<string, string | number | undefined>; reason: string | null;
  status: string; proposed_at: string; decided_at: string | null;
};

const STATUS: Record<string, string> = {
  pending: "Menunggu", approved: "Disetujui", executed: "✅ Dijalankan", rejected: "Ditolak", failed: "❌ Gagal",
};

function Detail({ a }: { a: Approval }) {
  const p = a.payload;
  if (a.action_type === "update_base_rate") {
    const oldR = Number(p.old_rate ?? 0), newR = Number(p.new_rate);
    const pct = oldR ? Math.round((1000 * (newR - oldR)) / oldR) / 10 : null;
    return (
      <p className="text-sm">
        <b>{p.property_name}</b>: harga dasar {formatIDR(oldR)} → <b>{formatIDR(newR)}</b>
        {pct !== null && <span className="text-stone-500"> ({pct > 0 ? "+" : ""}{pct}%)</span>}
      </p>
    );
  }
  if (a.action_type === "set_rate_range") {
    return (
      <p className="text-sm">
        <b>{p.property_name}</b>: harga <b>{formatIDR(Number(p.rate))}</b>/malam untuk {p.date_from} s/d {p.date_to}
        {p.min_stay ? ` · min. ${p.min_stay} malam` : ""}
      </p>
    );
  }
  return (
    <div className="text-sm">
      <p><b>{p.property_name}</b>: {p.title}</p>
      <p className="text-stone-500">Jenis: {p.type} · Prioritas: {p.priority ?? "normal"}{p.due_date ? ` · Tenggat: ${p.due_date}` : ""}</p>
      {p.notes && <p className="text-stone-600">{p.notes}</p>}
    </div>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const sp = await searchParams;
  const { supabase, role } = await getCurrentOrg();
  const { data } = await supabase.from("approvals").select("*").order("proposed_at", { ascending: false }).limit(50);
  const all = (data ?? []) as Approval[];
  const pending = all.filter((a) => a.status === "pending");
  const decided = all.filter((a) => a.status !== "pending");

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Persetujuan</h1>
        <p className="text-sm text-stone-500">Usulan dari Asisten AI. Tidak ada yang dijalankan sebelum kamu setujui.</p>
      </div>
      <Flash error={sp.error} message={sp.message} />

      {pending.length === 0 && <div className="card text-sm text-stone-500">Tidak ada usulan yang menunggu.</div>}
      {pending.map((a) => (
        <div key={a.id} className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium">{ACTION_LABELS[a.action_type] ?? a.action_type}</span>
            <span className="text-xs text-stone-400">{new Date(a.proposed_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
          <Detail a={a} />
          {a.reason && <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700"><b>Alasan AI:</b> {a.reason}</p>}
          {role !== "staff" && (
            <div className="flex gap-2">
              <form action={decide.bind(null, a.id, "approve")}><button className="btn">Setujui &amp; jalankan</button></form>
              <form action={decide.bind(null, a.id, "reject")}><button className="btn-secondary">Tolak</button></form>
            </div>
          )}
        </div>
      ))}

      {decided.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Riwayat</h2>
          <ul className="divide-y divide-stone-100 text-sm">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{ACTION_LABELS[a.action_type]}: {a.payload.property_name} — {a.action_type === "update_base_rate" ? formatIDR(Number(a.payload.new_rate)) : a.action_type === "set_rate_range" ? `${formatIDR(Number(a.payload.rate))} (${a.payload.date_from}–${a.payload.date_to})` : a.payload.title}</span>
                <span className="text-stone-500">{STATUS[a.status] ?? a.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
