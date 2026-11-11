import ReactMarkdown from "react-markdown";
import { requireManager } from "@/lib/org";
import { getLookups } from "@/lib/data";
import { aiEnabled } from "@/lib/agent/claude";
import { formatIDR } from "@/lib/format";
import { Flash } from "@/components/flash";
import { PricingTabs } from "../tabs";
import { addCompetitor, addCompetitorRate, runResearch } from "./actions";
import { ResearchButton } from "./research-button";

type Comp = { id: string; name: string; url: string | null; location: string | null; bedrooms: number | null; source: string | null };
type Rate = { competitor_id: string; date: string; rate: number; source: string | null };
type Listing = { name: string; url: string | null; nightly_rate_idr: number; date_from: string; date_to: string; source_site: string; confidence: string; notes: string | null };

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; error?: string; message?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, role } = await requireManager();
  const { properties } = await getLookups(supabase);
  if (properties.length === 0) return <p className="text-sm text-stone-500">Tambahkan villa terlebih dahulu.</p>;
  const property = properties.find((p) => p.id === sp.property)?.id ?? properties[0].id;
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: comps }, { data: rates }, { data: research }, { data: villa }] = await Promise.all([
    supabase.from("competitors").select("id, name, url, location, bedrooms, source").order("name"),
    supabase.from("competitor_rates").select("competitor_id, date, rate, source").gte("date", today).lte("date", in30),
    supabase.from("reports").select("id, period_start, period_end, ai_summary, metrics, created_at")
      .eq("property_id", property).eq("period_type", "custom").order("created_at", { ascending: false }).limit(3),
    supabase.from("properties").select("name, base_rate, bedrooms, location").eq("id", property).single(),
  ]);
  const competitors = (comps ?? []) as Comp[];
  const r30 = (rates ?? []) as Rate[];
  const stats = (id: string) => {
    const xs = r30.filter((r) => r.competitor_id === id).map((r) => Number(r.rate)).sort((a, b) => a - b);
    return xs.length ? { n: xs.length, min: xs[0], max: xs[xs.length - 1], median: xs[xs.length >> 1] } : null;
  };
  const canEdit = role !== "staff";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Harga</h1>
      <PricingTabs active="competitors" property={property} />
      <Flash error={sp.error} message={sp.message} />

      <form className="flex items-center gap-2">
        <select name="property" defaultValue={property} className="input w-auto">
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn-secondary">Pilih</button>
      </form>

      {canEdit && (
        <div className="card space-y-3">
          <div>
            <h2 className="font-semibold">✦ Riset harga kompetitor dengan AI</h2>
            <p className="text-sm text-stone-500">
              AI mencari villa sebanding dengan {villa?.name} ({villa?.bedrooms ?? "?"} kamar, {villa?.location ?? "Bali"}) di web,
              lalu menyimpan harganya. Butuh ±1–2 menit dan memakai kredit API (web search).
            </p>
          </div>
          {aiEnabled() ? (
            <form action={runResearch.bind(null, property)} className="flex flex-wrap items-end gap-2">
              <div><label className="label" htmlFor="rs-from">Dari</label><input id="rs-from" name="date_from" type="date" className="input" defaultValue={today} required /></div>
              <div><label className="label" htmlFor="rs-to">Sampai (maks 31 hari)</label><input id="rs-to" name="date_to" type="date" className="input" defaultValue={in7} required /></div>
              <ResearchButton />
            </form>
          ) : <p className="text-sm text-amber-800">Isi ANTHROPIC_API_KEY untuk memakai riset AI.</p>}
          <p className="text-xs text-stone-500">Hasil riset web adalah perkiraan — harga OTA berubah cepat dan bisa berbeda per tanggal. Periksa sumbernya sebelum mengambil keputusan.</p>
        </div>
      )}

      {(research ?? []).map((r) => (
        <div key={r.id} className="card space-y-2">
          <p className="text-xs text-stone-500">Riset {new Date(r.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })} · tanggal {r.period_start} s/d {r.period_end}</p>
          {r.ai_summary && <div className="chat-md text-sm"><ReactMarkdown>{r.ai_summary}</ReactMarkdown></div>}
          <details className="text-sm">
            <summary className="cursor-pointer text-stone-600">{(r.metrics as { listings: Listing[] }).listings.length} listing ditemukan</summary>
            <ul className="mt-2 space-y-1">
              {(r.metrics as { listings: Listing[] }).listings.map((l, i) => (
                <li key={i}>
                  {l.url ? <a href={l.url} target="_blank" rel="noreferrer noopener" className="text-emerald-700 underline">{l.name}</a> : l.name}
                  {" · "}{formatIDR(l.nightly_rate_idr)} · {l.date_from}–{l.date_to} · {l.source_site} · keyakinan {l.confidence}
                  {l.notes && <span className="text-stone-500"> · {l.notes}</span>}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}

      <div className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Kompetitor ({competitors.length})</h2>
        <p className="mb-2 text-sm text-stone-500">Harga 30 hari ke depan · harga dasar kamu: {formatIDR(villa?.base_rate)}</p>
        <table className="w-full min-w-[600px] text-sm">
          <thead className="text-left text-stone-500"><tr><th className="py-1">Nama</th><th>Lokasi</th><th>Kamar</th><th className="text-right">Median</th><th className="text-right">Kisaran</th><th>Sumber</th></tr></thead>
          <tbody>
            {competitors.map((c) => {
              const s = stats(c.id);
              return (
                <tr key={c.id} className="border-t border-stone-100">
                  <td className="py-1">{c.url ? <a href={c.url} target="_blank" rel="noreferrer noopener" className="text-emerald-700 underline">{c.name}</a> : c.name}</td>
                  <td>{c.location ?? "—"}</td><td>{c.bedrooms ?? "—"}</td>
                  <td className="text-right">{s ? formatIDR(s.median, true) : "—"}</td>
                  <td className="text-right text-stone-500">{s ? `${formatIDR(s.min, true)}–${formatIDR(s.max, true)}` : "belum ada harga"}</td>
                  <td className="text-stone-500">{c.source === "ai_research" ? "riset AI" : "manual"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <h2 className="mb-3 font-semibold">Tambah kompetitor</h2>
            <form action={addCompetitor.bind(null, property)} className="space-y-2">
              <input name="name" className="input" placeholder="Nama villa" required aria-label="Nama villa" />
              <input name="url" className="input" placeholder="Link listing (opsional)" aria-label="Link" />
              <div className="grid grid-cols-2 gap-2">
                <input name="location" className="input" placeholder="Lokasi" aria-label="Lokasi" />
                <input name="bedrooms" type="number" min={0} className="input" placeholder="Kamar" aria-label="Kamar" />
              </div>
              <button className="btn-secondary">Tambah</button>
            </form>
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">Catat harga kompetitor</h2>
            <form action={addCompetitorRate.bind(null, property)} className="space-y-2">
              <select name="competitor_id" className="input" required aria-label="Kompetitor">
                {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input name="date_from" type="date" className="input" defaultValue={today} required aria-label="Dari" />
                <input name="date_to" type="date" className="input" defaultValue={in7} required aria-label="Sampai" />
              </div>
              <input name="rate" inputMode="numeric" className="input" placeholder="Harga per malam (Rp)" required aria-label="Harga" />
              <button className="btn-secondary">Simpan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
