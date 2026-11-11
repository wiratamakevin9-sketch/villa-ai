# Villa AI

Asisten manajemen bisnis villa berbasis AI: analisis bisnis, okupansi, harga, marketing,
booking, operasional, dan laporan keuangan untuk banyak properti sekaligus.

**Stack:** Next.js (TypeScript) · Supabase (PostgreSQL, Auth, RLS, Storage) · Claude API · Vercel

## Mulai

Panduan per fase: [Fase 0](docs/PANDUAN-FASE-0.md) · [Fase 1](docs/PANDUAN-FASE-1.md) · [Fase 2: Asisten AI](docs/PANDUAN-FASE-2.md) · [Fase 3: Proaktif](docs/PANDUAN-FASE-3.md) · [Fase 4: Integrasi](docs/PANDUAN-FASE-4.md) · [Fase 5: Harga](docs/PANDUAN-FASE-5.md) · [Fase 6: Operasional & Tim](docs/PANDUAN-FASE-6.md) · [Fase 7: Advanced](docs/PANDUAN-FASE-7.md) · [Online-kan ke Vercel](docs/PANDUAN-DEPLOY-VERCEL.md)

Ringkasnya:

```bash
npm install
cp .env.example .env.local   # isi URL & anon key Supabase
npx supabase link --project-ref <ID>
npx supabase db push         # jalankan migrasi database
npm run dev
```

## Struktur

```
app/
  (dashboard)/        Ringkasan, Portofolio, Asisten AI, Alert, Persetujuan, Laporan, Booking,
                      Kalender, Harga, Keuangan, Operasional, Villa, Tim, Pengaturan
  api/agent/          Endpoint streaming Asisten AI
  api/export/         Unduh CSV (login)
  api/feed/           Feed CSV Google Sheets (token rahasia)
  login/ onboarding/  Login, daftar, buat bisnis
lib/
  supabase/           Koneksi database (server + middleware)
  agent/              Asisten AI: tools (data), prompt, loop agent
  approvals.ts        Antrean persetujuan: validasi & eksekusi aksi usulan AI
  org.ts              Ambil bisnis & role user yang login
  format.ts           Format Rupiah, persen, bulan
supabase/migrations/  Skema database, keamanan, view KPI, data contoh
docs/                 Panduan per fase
```

## Prinsip

1. **Angka dihitung SQL** (view `v_monthly_kpi` dll.), AI hanya menjelaskan & merekomendasikan.
2. **AI membaca dulu.** Aksi yang mengubah data/mengirim pesan lewat tabel `approvals`.
3. **Multi-villa sejak awal.** Semua data terikat `org_id` / `property_id` dan diamankan RLS.
