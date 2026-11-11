import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { requireManager } from "@/lib/org";
import { aiEnabled } from "@/lib/agent/claude";
import { Flash } from "@/components/flash";
import { SeverityBadge } from "@/components/severity";
import { explainAlert, runChecks, setAlertStatus } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  low_forward_occupancy: "Okupansi ke depan rendah",
  expense_anomaly: "Pengeluaran tidak wajar",
  occupancy_drop: "Okupansi turun",
  monthly_loss: "Rugi bulanan",
  booking_gap: "Celah booking",
  asset_service_due: "Servis aset",
};
const SEV_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

type Alert = {
  id: string; type: string; severity: string; title: string; status: string; created_at: string;
  data: Record<string, unknown>; ai_explanation: string | null; properties: { name: string } | null;
};

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const showAll = sp.show === "all";
  const { supabase, role } = await requireManager();
  let q = supabase.from("alerts")
    .select("id, type, severity, title, status, created_at, data, ai_explanation, properties(name)")
    .order("created_at", { ascending: false }).limit(100);
  if (!showAll) q = q.neq("status", "resolved");
  const { data } = await q;
  const alerts = ((data ?? []) as unknown as Alert[]).sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3),
  );
  const canAct = role !== "staff";

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Alert</h1>
          <p className="text-sm text-stone-500">Dicek otomatis setiap pagi pukul 08:05 WITA.</p>
        </div>
        <form action={runChecks}><button className="btn-secondary">Cek sekarang</button></form>
      </div>
      <Flash error={sp.error} message={sp.message} />
      <div className="flex gap-3 text-sm">
        <Link href="/alerts" className={!showAll ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Belum selesai</Link>
        <Link href="/alerts?show=all" className={showAll ? "font-medium text-emerald-800 underline" : "text-stone-500"}>Semua</Link>
      </div>

      {alerts.length === 0 && (
        <div className="card text-sm text-stone-500">✅ Tidak ada alert. Bisnis berjalan normal menurut aturan pengecekan.</div>
      )}

      {alerts.map((a) => (
        <div key={a.id} id={`a-${a.id}`} className={`card space-y-3 ${a.status === "resolved" ? "opacity-60" : ""}`}>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={a.severity} />
            <span className="text-xs text-stone-500">{TYPE_LABEL[a.type] ?? a.type}</span>
            <span className="text-xs text-stone-400">· {new Date(a.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
            {a.status !== "open" && <span className="text-xs text-stone-500">· {a.status === "resolved" ? "selesai" : "sudah dibaca"}</span>}
          </div>
          <p className="font-medium">{a.title}</p>

          {a.ai_explanation ? (
            <div className="chat-md rounded-lg bg-stone-50 p-3 text-sm">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.ai_explanation}</ReactMarkdown>
            </div>
          ) : (
            canAct && aiEnabled() && a.status !== "resolved" && (
              <form action={explainAlert.bind(null, a.id)}>
                <button className="text-sm text-emerald-700 underline">✦ Jelaskan &amp; beri saran (AI)</button>
              </form>
            )
          )}

          {canAct && a.status !== "resolved" && (
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href={`/assistant`} className="btn-secondary px-3 py-1">Diskusikan dengan Asisten</Link>
              {a.status === "open" && (
                <form action={setAlertStatus.bind(null, a.id, "acknowledged")}><button className="btn-secondary px-3 py-1">Tandai dibaca</button></form>
              )}
              <form action={setAlertStatus.bind(null, a.id, "resolved")}><button className="btn-secondary px-3 py-1">Sudah ditangani</button></form>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
