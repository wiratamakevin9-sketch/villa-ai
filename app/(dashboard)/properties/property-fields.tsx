export type PropertyRecord = {
  id?: string; name?: string; code?: string | null; location?: string | null; bedrooms?: number | null;
  bathrooms?: number | null; max_guests?: number | null; base_rate?: number | null;
  purchase_price?: number | null; opening_date?: string | null; status?: string;
  min_rate?: number | null; max_rate?: number | null;
};

const money = (v?: number | null) => (v == null ? "" : Math.round(Number(v)));

export function PropertyFields({ p = {}, showStatus = false }: { p?: PropertyRecord; showStatus?: boolean }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="name">Nama villa *</label>
        <input className="input" id="name" name="name" required defaultValue={p.name ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="code">Kode singkat</label>
        <input className="input" id="code" name="code" placeholder="mis. VSI" maxLength={6} defaultValue={p.code ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="location">Lokasi</label>
        <input className="input" id="location" name="location" placeholder="mis. Canggu, Badung" defaultValue={p.location ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="bedrooms">Jumlah kamar tidur</label>
        <input className="input" id="bedrooms" name="bedrooms" type="number" min={0} defaultValue={p.bedrooms ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="bathrooms">Jumlah kamar mandi</label>
        <input className="input" id="bathrooms" name="bathrooms" type="number" min={0} defaultValue={p.bathrooms ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="max_guests">Maksimal tamu</label>
        <input className="input" id="max_guests" name="max_guests" type="number" min={1} defaultValue={p.max_guests ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="base_rate">Harga dasar per malam (Rp)</label>
        <input className="input" id="base_rate" name="base_rate" inputMode="numeric" placeholder="2500000" defaultValue={money(p.base_rate)} />
      </div>
      <div>
        <label className="label" htmlFor="min_rate">Harga minimum per malam (Rp)</label>
        <input className="input" id="min_rate" name="min_rate" inputMode="numeric" placeholder="default 60% harga dasar" defaultValue={money(p.min_rate)} />
      </div>
      <div>
        <label className="label" htmlFor="max_rate">Harga maksimum per malam (Rp)</label>
        <input className="input" id="max_rate" name="max_rate" inputMode="numeric" placeholder="default 200% harga dasar" defaultValue={money(p.max_rate)} />
      </div>
      <div>
        <label className="label" htmlFor="purchase_price">Nilai investasi (Rp)</label>
        <input className="input" id="purchase_price" name="purchase_price" inputMode="numeric" placeholder="untuk hitung ROI" defaultValue={money(p.purchase_price)} />
      </div>
      <div>
        <label className="label" htmlFor="opening_date">Mulai beroperasi</label>
        <input className="input" id="opening_date" name="opening_date" type="date" defaultValue={p.opening_date ?? ""} />
      </div>
      {showStatus && (
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select className="input" id="status" name="status" defaultValue={p.status ?? "active"}>
            <option value="active">Aktif</option>
            <option value="inactive">Tidak aktif (disembunyikan dari laporan)</option>
          </select>
        </div>
      )}
    </>
  );
}
