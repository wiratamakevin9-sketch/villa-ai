import { getCurrentOrg } from "@/lib/org";
import { formatIDR } from "@/lib/format";
import { addProperty } from "./actions";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase, role } = await getCurrentOrg();
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, code, location, bedrooms, max_guests, base_rate, opening_date, status, notes")
    .order("name");

  const canEdit = role !== "staff";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Villa</h1>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(properties ?? []).map((p) => (
          <div key={p.id} className="card">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-sm text-stone-500">{p.location ?? "—"}</p>
              </div>
              <div className="flex gap-1">
                {p.notes === "[DEMO]" && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">contoh</span>
                )}
                <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">{p.code ?? "—"}</span>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-stone-400">Kamar</dt><dd>{p.bedrooms ?? "—"}</dd></div>
              <div><dt className="text-stone-400">Maks tamu</dt><dd>{p.max_guests ?? "—"}</dd></div>
              <div><dt className="text-stone-400">Harga dasar</dt><dd>{formatIDR(p.base_rate, true)}</dd></div>
            </dl>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="card max-w-2xl">
          <h2 className="mb-4 font-semibold">Tambah villa</h2>
          {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <form action={addProperty} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Nama villa *</label>
              <input className="input" id="name" name="name" required />
            </div>
            <div>
              <label className="label" htmlFor="code">Kode singkat</label>
              <input className="input" id="code" name="code" placeholder="mis. VSI" maxLength={6} />
            </div>
            <div>
              <label className="label" htmlFor="location">Lokasi</label>
              <input className="input" id="location" name="location" placeholder="mis. Canggu, Badung" />
            </div>
            <div>
              <label className="label" htmlFor="bedrooms">Jumlah kamar tidur</label>
              <input className="input" id="bedrooms" name="bedrooms" type="number" min={0} />
            </div>
            <div>
              <label className="label" htmlFor="bathrooms">Jumlah kamar mandi</label>
              <input className="input" id="bathrooms" name="bathrooms" type="number" min={0} />
            </div>
            <div>
              <label className="label" htmlFor="max_guests">Maksimal tamu</label>
              <input className="input" id="max_guests" name="max_guests" type="number" min={1} />
            </div>
            <div>
              <label className="label" htmlFor="base_rate">Harga dasar per malam (Rp)</label>
              <input className="input" id="base_rate" name="base_rate" inputMode="numeric" placeholder="2500000" />
            </div>
            <div>
              <label className="label" htmlFor="purchase_price">Nilai investasi (Rp)</label>
              <input className="input" id="purchase_price" name="purchase_price" inputMode="numeric" placeholder="untuk hitung ROI" />
            </div>
            <div>
              <label className="label" htmlFor="opening_date">Mulai beroperasi</label>
              <input className="input" id="opening_date" name="opening_date" type="date" />
            </div>
            <div className="sm:col-span-2">
              <button className="btn">Simpan villa</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
