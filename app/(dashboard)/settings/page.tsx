import { getCurrentOrg } from "@/lib/org";
import { addChannel, clearDemo, loadDemo, updateChannel } from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const { supabase, org, role } = await getCurrentOrg();
  const { data: channels } = await supabase
    .from("channels")
    .select("id, name, type, commission_pct, active")
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
            <li key={c.id} className="py-2">
              <form action={updateChannel.bind(null, c.id)} className="flex flex-wrap items-center gap-2">
                <span className="min-w-40 flex-1">{c.name} <span className="text-stone-400">({c.type})</span></span>
                <label className="flex items-center gap-1">
                  <input name="commission_pct" type="number" step="0.1" min={0} max={100} defaultValue={c.commission_pct}
                    className="input w-20 py-1" aria-label={`Komisi ${c.name}`} disabled={role === "staff"} />%
                </label>
                <label className="flex items-center gap-1 text-xs text-stone-500">
                  <input type="checkbox" name="active" defaultChecked={c.active} disabled={role === "staff"} /> aktif
                </label>
                {role !== "staff" && <button className="btn-secondary px-3 py-1">Simpan</button>}
              </form>
            </li>
          ))}
        </ul>
        {role !== "staff" && (
          <form action={addChannel} className="mt-4 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-4">
            <div className="flex-1"><label className="label" htmlFor="ch-name">Channel baru</label>
              <input id="ch-name" name="name" className="input" placeholder="mis. Expedia, Traveloka" required /></div>
            <div><label className="label" htmlFor="ch-type">Jenis</label>
              <select id="ch-type" name="type" className="input">
                <option value="ota">OTA</option><option value="agent">Travel agent</option>
                <option value="direct">Langsung</option><option value="other">Lainnya</option>
              </select></div>
            <div><label className="label" htmlFor="ch-pct">Komisi %</label>
              <input id="ch-pct" name="commission_pct" type="number" step="0.1" min={0} max={100} defaultValue={15} className="input w-20" /></div>
            <button className="btn">Tambah</button>
          </form>
        )}
        <p className="mt-3 text-xs text-stone-400">Komisi % dipakai untuk menghitung komisi otomatis saat booking baru dicatat. Booking lama tidak berubah.</p>
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
