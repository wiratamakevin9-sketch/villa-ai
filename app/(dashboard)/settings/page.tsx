import { getCurrentOrg } from "@/lib/org";
import { clearDemo, loadDemo } from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const { supabase, org, role } = await getCurrentOrg();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, name, type, commission_pct")
    .order("name");

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Pengaturan</h1>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <div className="card">
        <h2 className="font-semibold">Bisnis</h2>
        <p className="text-sm text-stone-500">
          {org.name} · {org.currency} · {org.timezone}
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Channel penjualan & komisi</h2>
        <ul className="divide-y divide-stone-100 text-sm">
          {(channels ?? []).map((c) => (
            <li key={c.id} className="flex justify-between py-2">
              <span>{c.name} <span className="text-stone-400">({c.type})</span></span>
              <span>{c.commission_pct}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-stone-400">Form edit komisi menyusul di Fase 1.</p>
      </div>

      {role === "owner" && (
        <div className="card">
          <h2 className="font-semibold">Data contoh</h2>
          <p className="mb-4 text-sm text-stone-500">
            3 villa fiktif dengan ±6 bulan riwayat. Hapus sebelum mulai memasukkan data asli
            agar laporan tidak tercampur. Data asli kamu tidak ikut terhapus.
          </p>
          <div className="flex gap-2">
            <form action={loadDemo}><button className="btn-secondary">Muat data contoh</button></form>
            <form action={clearDemo}><button className="btn-secondary text-red-700">Hapus data contoh</button></form>
          </div>
        </div>
      )}
    </div>
  );
}
