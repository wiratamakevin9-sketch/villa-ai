# Panduan Fase 1 — MVP Data

Fase 1 membuat Villa AI bisa dipakai sebagai **sistem pencatatan harian**: booking, kalender,
keuangan, impor data OTA, dan grafik tren. Inilah bahan bakar untuk asisten AI di Fase 2.

## Status

| Bagian | Status |
|---|---|
| Proyek Supabase `villa-ai` (region Singapore) | ✅ Sudah dibuat & semua migrasi terpasang |
| Security Advisor Supabase | ✅ Peringatan utama sudah diperbaiki (migrasi `security_hardening`) |
| Aplikasi web | ✅ Diuji end-to-end terhadap database asli (11 skenario lolos) |

## Menjalankan di komputer kamu

`.env.local` sudah terisi untuk proyek kamu:

```
NEXT_PUBLIC_SUPABASE_URL=https://bgpzogatxbovulzrxzgw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...   (publishable key, aman di frontend)
```

```bash
npm install
```

```bash
npm run dev
```

Buka <http://localhost:3000> lalu **Daftar**. Supabase akan mengirim email konfirmasi; klik link-nya,
lalu login. (Untuk masa pengembangan, "Confirm email" bisa dimatikan di
Supabase → Authentication → Sign In / Providers → Email.)

## Fitur baru

### Booking
- **Daftar booking** per bulan, filter per villa, ringkasan nilai kotor & bersih.
- **Tambah / edit booking**: tamu, channel, tanggal, harga, status, kode OTA, catatan.
  - Komisi dikosongkan → **dihitung otomatis** dari % channel.
  - Booking bentrok tanggal → **ditolak** dengan pesan jelas.
  - Tamu batal → ubah status jadi *Dibatalkan* (data tetap tersimpan untuk analisis).

### Kalender
- Semua villa dalam satu layar per bulan, warna per channel, % terisi per villa.
- Arahkan kursor untuk melihat nama tamu, klik untuk membuka booking.

### Impor CSV dari OTA
1. Ekspor CSV dari Airbnb / Booking.com / Agoda (petunjuk muncul di layar sesuai sumber).
2. Pilih villa tujuan, sumber, dan format tanggal.
3. Kolom dicocokkan **otomatis**; periksa dan ubah jika perlu.
4. Pratinjau menandai baris bermasalah (tanggal/harga tidak terbaca) dengan warna merah.
5. Klik **Impor**. Hasilnya: berhasil / sudah ada / bentrok / gagal.

Aman diimpor berulang: booking dengan **kode booking** yang sama otomatis dilewati.
Untuk booking WhatsApp/langsung, unduh **template CSV** di halaman impor.

### Keuangan
- Catat **pengeluaran** dan **pendapatan lain** per villa, atau sebagai **biaya bersama**.
- **Upload foto nota** (bisa langsung dari kamera HP), tersimpan privat, maksimal 10 MB.
- Ringkasan pengeluaran per kategori setiap bulan.

### Ringkasan (dashboard)
- **Grafik 12 bulan**: pendapatan kamar vs laba bersih, dan tren okupansi.
  Bisa dilihat juga sebagai tabel.

### Villa & Pengaturan
- Edit data villa, atau nonaktifkan villa.
- Ubah **% komisi** tiap channel, tambah channel baru (mis. Traveloka, Expedia).

## Rutinitas yang disarankan

| Kapan | Apa |
|---|---|
| Setiap ada booking | Catat di **Booking → Tambah**, atau impor CSV OTA seminggu sekali |
| Setiap ada pengeluaran | Catat di **Keuangan** + foto nota |
| Akhir bulan | Cek **Ringkasan**: okupansi, ADR, laba per villa |

Setelah data asli mulai masuk, **hapus data contoh** di Pengaturan agar laporan tidak tercampur.

## Catatan teknis

- File di `supabase/migrations/` sudah sama dengan riwayat migrasi di Supabase.
  Perubahan database berikutnya cukup ditambahkan sebagai file baru, lalu `npx supabase db push`.
- Unit test logika impor CSV: `npm test`.

## Berikutnya: Fase 2 — Asisten AI

Chat dengan AI yang membaca data kamu, misalnya:
*"Kenapa laba Oktober Villa Pantai Biru turun?"* atau *"Channel mana yang paling menguntungkan?"*.
Yang dibutuhkan: **API key Anthropic (Claude)** dari <https://console.anthropic.com>.
