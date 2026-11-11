import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSheetsLink, revokeSheetsLink, saveWhatsApp, testWhatsApp } from "./integrations-actions";

type Settings = {
  wa_enabled: boolean; wa_phone_number_id: string | null; wa_template: string; wa_language: string; wa_api_version: string;
  wa_recipients: string[]; notify_daily_alerts: boolean; notify_reports: boolean; notify_staff_tasks: boolean; app_url: string | null;
};
type Log = { recipient: string; kind: string; http_status: number; response: string | null; sent_at: string };

export async function IntegrationsSection({ supabase, orgId }: { supabase: SupabaseClient; orgId: string }) {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const [{ data: s }, { data: tokenSet }, { data: logs }, { data: exportTok }] = await Promise.all([
    supabase.from("notification_settings").select("*").eq("org_id", orgId).maybeSingle(),
    supabase.rpc("whatsapp_token_set", { p_org: orgId }),
    supabase.from("notification_log").select("recipient, kind, http_status, response, sent_at").eq("org_id", orgId)
      .order("sent_at", { ascending: false }).limit(5),
    supabase.from("export_tokens").select("created_at").eq("org_id", orgId).maybeSingle(),
  ]);
  const st = (s ?? {}) as Partial<Settings>;
  const newToken = (await cookies()).get("sheets_token")?.value;

  return (
    <div id="integrasi" className="space-y-6">
      {/* ---------------- WhatsApp ---------------- */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold">Notifikasi WhatsApp</h2>
          <p className="text-sm text-stone-500">Alert penting setiap pagi dan laporan mingguan/bulanan dikirim ke WhatsApp (Meta WhatsApp Cloud API resmi).</p>
        </div>
        <form action={saveWhatsApp} className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="wa_enabled" defaultChecked={st.wa_enabled ?? false} /> Aktifkan notifikasi WhatsApp
          </label>
          <div>
            <label className="label" htmlFor="wa-pnid">Phone number ID</label>
            <input id="wa-pnid" name="phone_number_id" className="input" defaultValue={st.wa_phone_number_id ?? ""} placeholder="mis. 123456789012345" />
          </div>
          <div>
            <label className="label" htmlFor="wa-token">Access token {tokenSet ? <span className="text-emerald-700">(tersimpan ✓)</span> : null}</label>
            <input id="wa-token" name="token" type="password" autoComplete="off" className="input"
              placeholder={tokenSet ? "Kosongkan jika tidak diganti" : "Token permanen (System User)"} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="wa-rcp">Nomor penerima (satu per baris)</label>
            <textarea id="wa-rcp" name="recipients" rows={2} className="input" defaultValue={(st.wa_recipients ?? []).join("\n")} placeholder="081234567890" />
          </div>
          <div>
            <label className="label" htmlFor="wa-tpl">Nama template</label>
            <input id="wa-tpl" name="template" className="input" defaultValue={st.wa_template ?? "villa_ai_notifikasi"} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label" htmlFor="wa-lang">Bahasa</label><input id="wa-lang" name="language" className="input" defaultValue={st.wa_language ?? "id"} /></div>
            <div><label className="label" htmlFor="wa-ver">Versi API</label><input id="wa-ver" name="api_version" className="input" defaultValue={st.wa_api_version ?? "v23.0"} /></div>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="wa-url">Link aplikasi (opsional, ditambahkan di akhir pesan)</label>
            <input id="wa-url" name="app_url" className="input" defaultValue={st.app_url ?? ""} placeholder="https://villa-ai.vercel.app" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_daily_alerts" defaultChecked={st.notify_daily_alerts ?? true} /> Alert penting harian</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="notify_reports" defaultChecked={st.notify_reports ?? true} /> Laporan mingguan &amp; bulanan</label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="notify_staff_tasks" defaultChecked={st.notify_staff_tasks ?? false} /> Kirim jadwal tugas harian ke WhatsApp masing-masing staf (nomor diatur di menu Tim)</label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn">Simpan</button></div>
        </form>
        {st.wa_enabled && <form action={testWhatsApp}><button className="btn-secondary">Kirim pesan tes</button></form>}
        <p className="text-xs text-stone-500">Token disimpan terenkripsi di Supabase Vault dan tidak bisa dibaca kembali dari aplikasi.</p>
        {(logs ?? []).length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-stone-600">Riwayat pengiriman terakhir</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {(logs as Log[]).map((l, i) => (
                <li key={i} className={l.http_status >= 200 && l.http_status < 300 ? "text-stone-600" : "text-red-700"}>
                  {new Date(l.sent_at).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })} · {l.kind} · {l.recipient} · HTTP {l.http_status}
                  {!(l.http_status >= 200 && l.http_status < 300) && l.response && ` · ${l.response.slice(0, 160)}`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* ---------------- Ekspor & Google Sheets ---------------- */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold">Ekspor ke Excel / Google Sheets</h2>
          <p className="text-sm text-stone-500">Unduh CSV (terbuka langsung di Excel), atau buat link live untuk Google Sheets yang ter-update otomatis.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary" href="/api/export?kind=bookings">Unduh booking (CSV)</a>
          <a className="btn-secondary" href="/api/export?kind=transactions">Unduh transaksi (CSV)</a>
          <a className="btn-secondary" href="/api/export?kind=kpi">Unduh KPI bulanan (CSV)</a>
        </div>

        <div className="border-t border-stone-100 pt-4">
          <h3 className="text-sm font-semibold">Link live Google Sheets</h3>
          {newToken ? (
            <div className="mt-2 space-y-2 text-sm">
              <p>Tempel rumus ini di sel A1 sheet kosong (data ter-update otomatis ±1 jam sekali oleh Google):</p>
              {["kpi", "bookings", "transactions"].map((k) => (
                <code key={k} className="block overflow-x-auto whitespace-nowrap rounded bg-stone-100 p-2 text-xs">
                  =IMPORTDATA(&quot;{origin}/api/feed/{newToken}/{k}.csv&quot;)
                </code>
              ))}
              <p className="text-xs text-amber-800">⚠️ Siapa pun yang memegang link ini bisa membaca data tersebut. Jangan bagikan sheet secara publik. Link hanya berfungsi jika aplikasi sudah online (mis. di Vercel).</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-stone-500">
              {exportTok ? `Link aktif sejak ${new Date(exportTok.created_at).toLocaleDateString("id-ID")}. Buat link baru untuk menampilkannya lagi (link lama otomatis tidak berlaku).` : "Belum ada link."}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={createSheetsLink}><button className="btn-secondary">{exportTok ? "Buat link baru" : "Buat link Google Sheets"}</button></form>
            {exportTok && <form action={revokeSheetsLink}><button className="btn-secondary text-red-700">Cabut link</button></form>}
          </div>
        </div>
      </div>
    </div>
  );
}
