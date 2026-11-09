import { getCurrentOrg } from "@/lib/org";
import { formatIDR } from "@/lib/format";
import { addProperty } from "./actions";
import { PropertyFields } from "./property-fields";
import { Flash } from "@/components/flash";
import Link from "next/link";

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const { supabase, role } = await getCurrentOrg();
  const { data: properties } = await supabase
    .from("properties")
    .select("id, name, code, location, bedrooms, max_guests, base_rate, opening_date, status, notes")
    .order("name");

  const canEdit = role !== "staff";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Villa</h1>
      <Flash message={message} />

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
            <div className="mt-4 flex gap-3 text-sm">
              <Link href={`/bookings?property=${p.id}`} className="text-emerald-700 underline">Booking</Link>
              <Link href={`/finance?property=${p.id}`} className="text-emerald-700 underline">Keuangan</Link>
              {canEdit && <Link href={`/properties/${p.id}`} className="text-emerald-700 underline">Edit</Link>}
            </div>
            {p.status === "inactive" && <p className="mt-2 text-xs text-stone-400">Tidak aktif</p>}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="card max-w-2xl">
          <h2 className="mb-4 font-semibold">Tambah villa</h2>
          {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <form action={addProperty} className="grid gap-4 sm:grid-cols-2">
            <PropertyFields />
            <div className="sm:col-span-2">
              <button className="btn">Simpan villa</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
