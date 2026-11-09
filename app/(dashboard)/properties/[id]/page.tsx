import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";
import { Flash } from "@/components/flash";
import { PropertyFields } from "../property-fields";
import { updateProperty } from "../actions";

export default async function EditPropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await getCurrentOrg();
  const { data: p } = await supabase.from("properties").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/properties" className="text-sm text-emerald-700">‹ Kembali ke daftar villa</Link>
      <h1 className="text-2xl font-semibold">Edit {p.name}</h1>
      <Flash error={error} />
      <div className="card">
        <form action={updateProperty.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
          <PropertyFields p={p} showStatus />
          <div className="sm:col-span-2"><button className="btn">Simpan perubahan</button></div>
        </form>
      </div>
    </div>
  );
}
