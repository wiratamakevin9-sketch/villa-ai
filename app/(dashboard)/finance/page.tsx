import { getCurrentOrg } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { currentMonth, formatDate, isValidMonth, monthRange } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { Flash } from "@/components/flash";
import { MonthNav } from "@/components/month-nav";
import { addTransaction, deleteTransaction } from "./actions";

type Tx = {
  id: string; date: string; type: "income" | "expense"; amount: number; description: string | null;
  payment_method: string | null; receipt_path: string | null; property_id: string | null;
  categories: { name: string; group_name: string | null } | null;
  properties: { name: string } | null;
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; property?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const month = isValidMonth(sp.month) ? sp.month : currentMonth();
  const { start, end } = monthRange(month);
  const { supabase, role } = await getCurrentOrg();
  const { properties, categories } = await getLookups(supabase);
  const canEdit = role !== "staff";

  let q = supabase
    .from("transactions")
    .select("id, date, type, amount, description, payment_method, receipt_path, property_id, categories(name, group_name), properties(name)")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false });
  if (sp.property === "shared") q = q.is("property_id", null);
  else if (sp.property) q = q.eq("property_id", sp.property);
  const { data } = await q;
  const txs = (data ?? []) as unknown as Tx[];

  // Link sementara (1 jam) untuk melihat foto nota privat
  const paths = txs.map((t) => t.receipt_path).filter((p): p is string => !!p);
  const signed = paths.length
    ? (await supabase.storage.from("receipts").createSignedUrls(paths, 3600)).data ?? []
    : [];
  const receiptUrl = (p: string | null) => signed.find((s) => s.path === p)?.signedUrl ?? undefined;

  const income = txs.filter((t) => t.type === "income").reduce((a, t) => a + Number(t.amount), 0);
  const expense = txs.filter((t) => t.type === "expense").reduce((a, t) => a + Number(t.amount), 0);
  const byCategory = Object.entries(
    txs.filter((t) => t.type === "expense").reduce<Record<string, number>>((acc, t) => {
      const k = t.categories?.name ?? "Lainnya";
      acc[k] = (acc[k] ?? 0) + Number(t.amount);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Keuangan</h1>
      <Flash error={sp.error} message={sp.message} />

      <div className="flex flex-wrap items-center gap-3">
        <MonthNav month={month} basePath="/finance" params={{ property: sp.property }} />
        <form className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <select name="property" defaultValue={sp.property ?? ""} className="input w-auto">
            <option value="">Semua</option>
            <option value="shared">Biaya bersama</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="card p-3"><p className="text-stone-500">Pengeluaran</p><p className="text-lg font-semibold">{formatIDR(expense)}</p></div>
            <div className="card p-3"><p className="text-stone-500">Pendapatan lain</p><p className="text-lg font-semibold">{formatIDR(income)}</p></div>
          </div>
          <p className="text-xs text-stone-500">Pendapatan sewa kamar dihitung dari menu Booking, bukan dicatat di sini.</p>

          <div className="card overflow-x-auto p-0">
            {txs.length === 0 ? (
              <p className="p-5 text-sm text-stone-500">Belum ada transaksi di bulan ini.</p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-stone-50 text-left text-stone-500">
                  <tr><th className="px-4 py-2">Tanggal</th><th>Kategori</th><th>Villa</th><th>Keterangan</th><th className="text-right">Jumlah</th><th className="px-4"></th></tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id} className="border-t border-stone-100">
                      <td className="whitespace-nowrap px-4 py-2">{formatDate(t.date)}</td>
                      <td>{t.categories?.name}</td>
                      <td>{t.properties?.name ?? <span className="text-stone-400">Bersama</span>}</td>
                      <td className="max-w-56 truncate" title={t.description ?? ""}>
                        {t.description ?? "—"}
                        {receiptUrl(t.receipt_path) && (
                          <a href={receiptUrl(t.receipt_path)} target="_blank" rel="noreferrer" className="ml-2 text-emerald-700 underline">nota</a>
                        )}
                      </td>
                      <td className={`text-right font-medium ${t.type === "income" ? "text-emerald-700" : ""}`}>
                        {t.type === "income" ? "+" : "−"}{formatIDR(t.amount)}
                      </td>
                      <td className="px-4 text-right">
                        {canEdit && (
                          <form action={deleteTransaction.bind(null, t.id, month)}>
                            <button className="text-xs text-stone-400 hover:text-red-700" aria-label="Hapus transaksi">Hapus</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {canEdit && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Catat transaksi</h2>
              <form action={addTransaction} className="space-y-3">
                <div>
                  <label className="label" htmlFor="category_id">Kategori *</label>
                  <select className="input" id="category_id" name="category_id" required defaultValue="">
                    <option value="" disabled>Pilih kategori</option>
                    <optgroup label="Pengeluaran">
                      {categories.filter((c) => c.type === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                    <optgroup label="Pemasukan lain">
                      {categories.filter((c) => c.type === "income").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="property_id">Villa</label>
                  <select className="input" id="property_id" name="property_id" defaultValue={sp.property && sp.property !== "shared" ? sp.property : ""}>
                    <option value="">Bersama (semua villa)</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="date">Tanggal *</label>
                    <input className="input" id="date" name="date" type="date" required defaultValue={defaultDate} />
                  </div>
                  <div>
                    <label className="label" htmlFor="amount">Jumlah (Rp) *</label>
                    <input className="input" id="amount" name="amount" inputMode="numeric" required placeholder="250000" />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="description">Keterangan</label>
                  <input className="input" id="description" name="description" placeholder="mis. Token listrik" />
                </div>
                <div>
                  <label className="label" htmlFor="payment_method">Metode bayar</label>
                  <select className="input" id="payment_method" name="payment_method" defaultValue="transfer">
                    <option value="transfer">Transfer</option><option value="cash">Tunai</option>
                    <option value="qris">QRIS</option><option value="card">Kartu</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="receipt">Foto nota (opsional)</label>
                  <input className="block w-full text-sm" id="receipt" name="receipt" type="file" accept="image/*,application/pdf" capture="environment" />
                </div>
                <button className="btn w-full">Simpan</button>
              </form>
            </div>
          )}

          {byCategory.length > 0 && (
            <div className="card">
              <h2 className="mb-3 font-semibold">Pengeluaran per kategori</h2>
              <ul className="space-y-2 text-sm">
                {byCategory.map(([name, total]) => (
                  <li key={name}>
                    <div className="flex justify-between"><span>{name}</span><span>{formatIDR(total, true)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                      <div className="h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(100 * total) / byCategory[0][1]}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
