import { requireManager } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { BookingTabs } from "../tabs";
import { Importer } from "./importer";

export default async function ImportPage() {
  const { supabase, role } = await requireManager();
  const { properties, channels } = await getLookups(supabase);

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Booking</h1>
      <BookingTabs active="import" />
      {role === "staff" ? (
        <p className="text-sm text-stone-500">Hanya owner/manager yang bisa mengimpor data.</p>
      ) : properties.length === 0 ? (
        <p className="text-sm text-stone-500">Tambahkan villa terlebih dahulu.</p>
      ) : (
        <Importer properties={properties} channels={channels} />
      )}
    </div>
  );
}
