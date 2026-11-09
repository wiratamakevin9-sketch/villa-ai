# Villa AI

Asisten manajemen bisnis villa berbasis AI: analisis bisnis, okupansi, harga, marketing,
booking, operasional, dan laporan keuangan untuk banyak properti sekaligus.

**Stack:** Next.js (TypeScript) · Supabase (PostgreSQL, Auth, RLS, Storage) · Claude API · Vercel

## Mulai

Panduan per fase: [Fase 0](docs/PANDUAN-FASE-0.md) · [Fase 1](docs/PANDUAN-FASE-1.md) · [Fase 2: Asisten AI](docs/PANDUAN-FASE-2.md)

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
  (dashboard)/        Ringkasan, Asisten AI, Booking, Kalender, Keuangan, Villa, Pengaturan
  api/agent/          Endpoint streaming Asisten AI
  login/ onboarding/  Login, daftar, buat bisnis
lib/
  supabase/           Koneksi database (server + middleware)
  agent/              Asisten AI: tools (data), prompt, loop agent
  org.ts              Ambil bisnis & role user yang login
  format.ts           Format Rupiah, persen, bulan
supabase/migrations/  Skema database, keamanan, view KPI, data contoh
docs/                 Panduan per fase
```

## Prinsip

1. **Angka dihitung SQL** (view `v_monthly_kpi` dll.), AI hanya menjelaskan & merekomendasikan.
2. **AI membaca dulu.** Aksi yang mengubah data/mengirim pesan lewat tabel `approvals`.
3. **Multi-villa sejak awal.** Semua data terikat `org_id` / `property_id` dan diamankan RLS.
