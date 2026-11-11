import type { SupabaseClient } from "@supabase/supabase-js";
import { addAsset, deleteAsset, markServiced } from "./asset-actions";

type Asset = { id: string; name: string; category: string | null; last_service_at: string | null; service_interval_days: number | null };

export async function AssetSection({ supabase, propertyId }: { supabase: SupabaseClient; propertyId: string }) {
  const { data } = await supabase.from("assets").select("id, name, category, last_service_at, service_interval_days")
    .eq("property_id", propertyId).order("name");
  const assets = (data ?? []) as Asset[];
  const today = new Date().toISOString().slice(0, 10);
  const next = (a: Asset) => a.last_service_at && a.service_interval_days
    ? new Date(Date.parse(a.last_service_at) + a.service_interval_days * 86_400_000).toISOString().slice(0, 10) : null;

  return (
    <div id="aset" className="card space-y-3">
      <div>
        <h2 className="font-semibold">Aset & jadwal servis</h2>
        <p className="text-sm text-stone-500">Tugas servis dibuat otomatis 7 hari sebelum jatuh tempo. Saat tugasnya selesai, tanggal servis terakhir diperbarui sendiri.</p>
      </div>
      {assets.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-stone-500"><tr><th className="py-1">Aset</th><th>Servis terakhir</th><th>Interval</th><th>Berikutnya</th><th></th></tr></thead>
            <tbody>
              {assets.map((a) => {
                const n = next(a);
                const late = n && n < today;
                return (
                  <tr key={a.id} className="border-t border-stone-100">
                    <td className="py-1.5">{a.name}{a.category && <span className="text-stone-400"> · {a.category}</span>}</td>
                    <td>{a.last_service_at ?? "—"}</td>
                    <td>{a.service_interval_days ? `${a.service_interval_days} hari` : "—"}</td>
                    <td className={late ? "font-medium text-red-700" : ""}>{n ?? "—"}{late && " (terlambat)"}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <form action={markServiced.bind(null, propertyId, a.id)}><button className="btn-secondary px-2 py-1 text-xs">Servis hari ini</button></form>
                        <form action={deleteAsset.bind(null, propertyId, a.id)}><button className="text-xs text-stone-400 hover:text-red-700">Hapus</button></form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <form action={addAsset.bind(null, propertyId)} className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div><label className="label text-xs" htmlFor="as-name">Aset baru</label><input id="as-name" name="name" className="input py-1" placeholder="mis. Pompa kolam" required /></div>
        <div><label className="label text-xs" htmlFor="as-cat">Kategori</label><input id="as-cat" name="category" className="input py-1" placeholder="AC, Kolam…" /></div>
        <div><label className="label text-xs" htmlFor="as-last">Servis terakhir</label><input id="as-last" name="last_service_at" type="date" className="input py-1" /></div>
        <div><label className="label text-xs" htmlFor="as-int">Setiap (hari)</label><input id="as-int" name="service_interval_days" type="number" min={1} className="input py-1" placeholder="90" /></div>
        <button className="btn px-3 py-1">Tambah</button>
      </form>
    </div>
  );
}
