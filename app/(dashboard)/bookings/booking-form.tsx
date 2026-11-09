import type { Channel, PropertyLite } from "@/lib/data";

export type BookingRecord = {
  id: string;
  property_id: string;
  channel_id: string | null;
  guest_id: string | null;
  check_in: string;
  check_out: string;
  guests_count: number | null;
  gross_amount: number;
  commission_amount: number;
  status: string;
  external_ref: string | null;
  notes: string | null;
  guests: { name: string; phone: string | null; country: string | null } | null;
};

export const STATUS_LABEL: Record<string, string> = {
  inquiry: "Pertanyaan / belum pasti",
  confirmed: "Terkonfirmasi",
  checked_in: "Sedang menginap",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  no_show: "Tidak datang",
};

export function BookingForm({
  action,
  properties,
  channels,
  booking,
  defaultPropertyId,
  defaults = {},
}: {
  action: (formData: FormData) => Promise<void>;
  properties: PropertyLite[];
  channels: Channel[];
  booking?: BookingRecord;
  defaultPropertyId?: string;
  defaults?: { check_in?: string; check_out?: string; channel_id?: string; ical_event_id?: string };
}) {
  const b = booking;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="guest_id" value={b?.guest_id ?? ""} />
      {defaults.ical_event_id && <input type="hidden" name="ical_event_id" value={defaults.ical_event_id} />}
      <div>
        <label className="label" htmlFor="property_id">Villa *</label>
        <select className="input" id="property_id" name="property_id" required
          defaultValue={b?.property_id ?? defaultPropertyId ?? ""}>
          <option value="" disabled>Pilih villa</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="channel_id">Channel</label>
        <select className="input" id="channel_id" name="channel_id" defaultValue={b?.channel_id ?? defaults.channel_id ?? ""}>
          <option value="">— Tidak diketahui —</option>
          {channels.filter((c) => c.active || c.id === b?.channel_id).map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.commission_pct}%)</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="guest_name">Nama tamu *</label>
        <input className="input" id="guest_name" name="guest_name" required defaultValue={b?.guests?.name ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="guest_phone">No. WhatsApp / telepon</label>
        <input className="input" id="guest_phone" name="guest_phone" type="tel" defaultValue={b?.guests?.phone ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="guest_country">Asal negara</label>
        <input className="input" id="guest_country" name="guest_country" defaultValue={b?.guests?.country ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="guests_count">Jumlah tamu</label>
        <input className="input" id="guests_count" name="guests_count" type="number" min={1} defaultValue={b?.guests_count ?? ""} />
      </div>

      <div>
        <label className="label" htmlFor="check_in">Check-in *</label>
        <input className="input" id="check_in" name="check_in" type="date" required defaultValue={b?.check_in ?? defaults.check_in} />
      </div>
      <div>
        <label className="label" htmlFor="check_out">Check-out *</label>
        <input className="input" id="check_out" name="check_out" type="date" required defaultValue={b?.check_out ?? defaults.check_out} />
      </div>

      <div>
        <label className="label" htmlFor="gross_amount">Total harga kamar (Rp) *</label>
        <input className="input" id="gross_amount" name="gross_amount" inputMode="numeric" required
          placeholder="mis. 7500000" defaultValue={b ? Math.round(Number(b.gross_amount)) : ""} />
        <p className="mt-1 text-xs text-stone-500">Total yang dibayar tamu untuk semua malam, sebelum komisi.</p>
      </div>
      <div>
        <label className="label" htmlFor="commission_amount">Komisi channel (Rp)</label>
        <input className="input" id="commission_amount" name="commission_amount" inputMode="numeric"
          defaultValue={b ? Math.round(Number(b.commission_amount)) : ""} />
        <p className="mt-1 text-xs text-stone-500">Kosongkan untuk dihitung otomatis dari % channel.</p>
      </div>

      <div>
        <label className="label" htmlFor="status">Status</label>
        <select className="input" id="status" name="status" defaultValue={b?.status ?? "confirmed"}>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="external_ref">Kode booking OTA</label>
        <input className="input" id="external_ref" name="external_ref" defaultValue={b?.external_ref ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">Catatan</label>
        <textarea className="input" id="notes" name="notes" rows={2} defaultValue={b?.notes ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <button className="btn">Simpan booking</button>
      </div>
    </form>
  );
}
