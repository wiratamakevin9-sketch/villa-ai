# Panduan Fase 0 — Fondasi Villa AI

Target Fase 0: **aplikasi web bisa dibuka, kamu bisa login, membuat bisnis, menambah villa,
dan melihat dashboard ringkasan** (dengan data contoh atau data asli).

Perkiraan waktu: 1–2 jam jika mengikuti langkah di bawah.

---

## Yang sudah dibuat

| Bagian | Isi | Lokasi |
|---|---|---|
| Skema database | 25 tabel: organisasi, villa, channel, tamu, booking, harga, musim, kompetitor, keuangan, anggaran, staf, tugas, aset, alert, persetujuan, laporan, dokumen, percakapan AI, audit log | `supabase/migrations/…001_core_schema.sql` |
| Keamanan | Row Level Security: setiap user hanya bisa melihat data bisnisnya; role owner / manager / staff | `…002_security_rls.sql` |
| View analitik | Okupansi, ADR, RevPAR, laba per villa per bulan; performa channel; deteksi pengeluaran tidak wajar; okupansi 30/60/90 hari ke depan | `…003_analytics_views.sql` |
| Data contoh | 3 villa fiktif (Ubud, Canggu, Uluwatu) + ±6 bulan booking & pengeluaran, bisa dihapus 1 klik | `…004_demo_data.sql` |
| Aplikasi web | Login/daftar, onboarding, Ringkasan (KPI), Villa (daftar + tambah), Pengaturan | `app/` |

### Fitur penting di database

- **Anti double-booking otomatis.** Database menolak booking yang bentrok tanggal di villa yang sama.
- **Komisi & pendapatan bersih dihitung otomatis** dari nilai booking.
- **Pendapatan booking yang melewati akhir bulan dibagi per malam** ke bulan yang benar.
- **Anomali biaya terdeteksi.** Di data contoh, ganti pompa kolam Rp 7,8 jt di Villa Pantai Biru
  terbaca sebagai pengeluaran 11× lipat dari rata-rata. Ini dasar alert otomatis di Fase 3.

---

## Langkah 1 — Siapkan akun (gratis)

1. **GitHub**: <https://github.com>, untuk menyimpan kode.
2. **Supabase**: <https://supabase.com>, daftar pakai akun GitHub.
3. **Vercel**: <https://vercel.com>, daftar pakai akun GitHub (untuk online-kan aplikasi).
4. Di komputer kamu, install **Node.js versi 20 atau lebih baru** (<https://nodejs.org>, pilih LTS)
   dan **Git** (<https://git-scm.com>).

## Langkah 2 — Buat proyek Supabase

1. Di dashboard Supabase klik **New project**.
2. Nama: `villa-ai`. **Region: Singapore** (paling dekat dengan Bali → paling cepat).
3. Buat password database yang kuat dan **simpan di password manager**.
4. Tunggu ±2 menit sampai proyek siap.

## Langkah 3 — Jalankan migrasi database

Pilih **salah satu** cara.

### Cara A (paling mudah): SQL Editor

1. Di Supabase buka **SQL Editor** → **New query**.
2. Buka file `supabase/migrations/20261108000001_core_schema.sql`, salin semua isinya,
   tempel, lalu klik **Run**.
3. Ulangi untuk file `…002`, `…003`, `…004` **sesuai urutan**.

### Cara B: Supabase CLI (disarankan untuk jangka panjang)

```bash
npx supabase login
```

```bash
npx supabase link --project-ref ID_PROYEK_KAMU
```

```bash
npx supabase db push
```

`ID_PROYEK_KAMU` ada di URL dashboard: `supabase.com/dashboard/project/<ID>`.
Keuntungan cara B: setiap perubahan database ke depan cukup `db push`, dan riwayatnya tercatat.

## Langkah 4 — Atur login

Di Supabase buka **Authentication → Sign In / Providers → Email**:

- Untuk masa pengembangan, kamu boleh **mematikan "Confirm email"** agar bisa langsung login
  setelah daftar.
- Sebelum dipakai staf atau online, **nyalakan kembali**.

## Langkah 5 — Jalankan aplikasi di komputer

```bash
cd villa-ai
```

```bash
npm install
```

```bash
cp .env.example .env.local
```

Buka `.env.local` lalu isi dua nilai dari Supabase (tombol **Connect** atau
**Project Settings → API Keys**):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...      ← "anon" / "publishable" key, BUKAN service_role / secret
```

Jalankan:

```bash
npm run dev
```

Buka <http://localhost:3000> → **Daftar** → isi nama bisnis → centang **data contoh** → **Mulai**.

## Langkah 6 — Online-kan dengan Vercel (opsional di Fase 0)

1. Upload folder proyek ke repository GitHub baru (private).
2. Di Vercel: **Add New → Project → Import** repository tersebut.
3. Di **Environment Variables**, isi dua nilai yang sama seperti `.env.local`.
4. Klik **Deploy**. Kamu akan dapat alamat seperti `villa-ai-xxx.vercel.app`.
5. Di Supabase **Authentication → URL Configuration**, isi *Site URL* dengan alamat Vercel tadi.

---

## Checklist Fase 0 selesai

- [ ] Bisa daftar & login
- [ ] Organisasi bisnis terbuat (channel & kategori keuangan default otomatis terisi)
- [ ] Data contoh muncul di halaman Ringkasan dan Villa
- [ ] Bisa menambah villa baru lewat form
- [ ] Data contoh bisa dihapus dari Pengaturan
- [ ] (Opsional) Aplikasi online di Vercel

## Aturan keamanan yang wajib dipegang

1. **Jangan pernah** membagikan atau meng-commit file `.env.local`, *service_role / secret key*,
   atau API key AI. File `.env*` sudah otomatis diabaikan git.
2. Key yang boleh ada di frontend hanya **anon / publishable key**, karena aksesnya dibatasi RLS.
3. Saat staf mulai memakai sistem, beri mereka role **staff** (bisa lihat data & update tugas,
   tidak bisa mengubah harga/keuangan).

---

## Karena belum ada sistem pencatatan: mulai mencatat sekarang

Data adalah bahan bakar AI. Semakin cepat data asli masuk, semakin cepat rekomendasi AI berguna.
Sambil Fase 1 dikerjakan (form booking & pengeluaran), kumpulkan ini untuk ketiga villa:

1. **Profil villa:** nama, lokasi, jumlah kamar, harga dasar, perkiraan nilai investasi, tanggal mulai beroperasi.
2. **Booking 6–12 bulan terakhir.** Hampir semua OTA bisa ekspor ke CSV/Excel:
   - Airbnb: *Menu → Transaction history → Export CSV*
   - Booking.com Extranet: *Reservations → Download*
   - Agoda YCS: *Bookings → Export*
   - WhatsApp/direct: rekap manual (tanggal, nama tamu, harga, jumlah malam).
3. **Pengeluaran rutin:** gaji staf, listrik, air, internet, laundry, kolam, marketing.
   Perkiraan per bulan pun sudah cukup sebagai awal.
4. **Komisi aktual** tiap channel (ubah dari default 15% jika berbeda).

Fase 1 akan menyediakan **fitur impor CSV** untuk file-file di atas, jadi simpan saja dulu.

---

## Berikutnya: Fase 1 — MVP Data

- Form & daftar **booking** (dengan kalender ketersediaan per villa)
- Form & daftar **pengeluaran/pemasukan** (+ upload foto nota)
- **Impor CSV** dari Airbnb / Booking.com / Agoda
- Edit komisi channel, edit data villa
- Grafik tren okupansi & laba 6–12 bulan

Setelah Fase 1, data sudah cukup untuk **Fase 2: Asisten AI** yang bisa ditanya, misalnya
*"Kenapa laba Oktober Villa Pantai Biru turun?"*
