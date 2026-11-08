import { createOrganization } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-xl font-semibold">Selamat datang 👋</h1>
        <p className="mb-6 text-sm text-stone-500">
          Langkah pertama: beri nama bisnis villa kamu. Semua villa nanti dikelola di bawah nama ini.
        </p>
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
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
