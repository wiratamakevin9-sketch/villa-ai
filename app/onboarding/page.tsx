import { acceptInvite, createOrganization } from "./actions";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: invites } = await supabase.rpc("my_pending_invites");
  const pending = (invites ?? []) as { id: string; org_name: string; role: string }[];
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-semibold">Selamat datang 👋</h1>
        <p className="mb-6 text-sm text-stone-500">
          Langkah pertama: beri nama bisnis villa kamu. Semua villa nanti dikelola di bawah nama ini.
        </p>
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {pending.length > 0 && (
          <div className="mb-6 space-y-2 rounded-lg bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">Kamu diundang bergabung:</p>
            {pending.map((i) => (
              <form key={i.id} action={acceptInvite.bind(null, i.id)} className="flex items-center justify-between gap-2">
                <span className="text-sm">{i.org_name} <span className="text-stone-500">({i.role === "manager" ? "manager" : "staf"})</span></span>
                <button className="btn px-3 py-1">Gabung</button>
              </form>
            ))}
            <p className="text-xs text-stone-500">Atau buat bisnis sendiri di bawah.</p>
          </div>
        )}
        <form action={createOrganization} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">Nama bisnis</label>
            <input className="input" id="name" name="name" placeholder="mis. Bali Villa Group" required />
          </div>
          <label className="flex items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" name="demo" defaultChecked className="mt-1" />
            <span>
              Isi dengan <b>data contoh</b> (3 villa, ±6 bulan booking & pengeluaran) agar dashboard bisa
              langsung dicoba. Bisa dihapus kapan saja di menu Pengaturan.
            </span>
          </label>
          <button className="btn w-full">Mulai</button>
        </form>
      </div>
    </main>
  );
}
