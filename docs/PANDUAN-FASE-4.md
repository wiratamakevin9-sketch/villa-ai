# Panduan Fase 4 — Integrasi

Tiga integrasi baru:

1. **Kalender OTA (iCal)** — Airbnb, Booking.com, Agoda tersinkron otomatis setiap jam.
2. **Notifikasi WhatsApp** — alert penting & laporan dikirim ke HP.
3. **Excel & Google Sheets** — unduh CSV atau link live untuk Google Sheets.

Semua sinkron & pengiriman berjalan di database Supabase (pg_cron), tanpa server tambahan.

---

## 1. Kalender OTA (iCal)

**Cara pasang (per villa, per OTA):**
1. Ambil link ekspor kalender:
   - **Airbnb:** Kalender → pilih listing → Ketersediaan → *Sambungkan kalender* → *Ekspor kalender* → salin link.
   - **Booking.com:** Extranet → Tarif & Ketersediaan → *Sinkronisasi kalender* → Ekspor → salin link.
   - **Agoda:** YCS → Kalender → Sinkronisasi iCal → salin link ekspor.
2. Villa AI → **Villa** → Edit villa → **Kalender OTA (iCal)** → pilih channel → tempel link → **Tambah**.

**Cara kerja:**
- Setiap jam (menit ke-17) kalender diambil. Booking di kalender OTA yang **belum dicatat** muncul di
  **Booking → Dari OTA**. Klik **Catat booking**: tanggal & channel sudah terisi, tinggal isi nama tamu & harga.
  > Kalender OTA tidak berisi harga & nama tamu, karena itu booking tidak dibuat otomatis — supaya laporan keuangan tetap akurat.
- Booking yang dicatat dengan tanggal sama otomatis tercocokkan.
- Tanggal yang diblokir ("Not available", "Closed") tidak dianggap booking.
- Booking yang **hilang dari kalender OTA** ditandai **"Mungkin dibatalkan"** + alert.
- Alert **"Booking … belum dicatat"** muncul untuk booking 30 hari ke depan (⚠️ jika ≤ 7 hari lagi).

> Link iCal bersifat rahasia (siapa pun yang memegangnya bisa melihat tanggal booking). Hanya owner/manager yang bisa melihatnya di aplikasi.

---

## 2. Notifikasi WhatsApp (Meta WhatsApp Cloud API)

**Persiapan di Meta (sekali saja, ±30–60 menit):**
1. Buat akun di <https://business.facebook.com> dan <https://developers.facebook.com> → **Create App** → tipe *Business* → tambahkan produk **WhatsApp**.
2. Daftarkan **nomor WhatsApp khusus bisnis** (nomor yang belum dipakai di aplikasi WhatsApp biasa).
   Catat **Phone number ID** (WhatsApp → API Setup).
3. Buat **token permanen**: Business Settings → Users → **System users** → Add → beri aset aplikasi WhatsApp
   → **Generate token** dengan izin `whatsapp_business_messaging`. (Token sementara di halaman API Setup kedaluwarsa dalam 24 jam.)
4. Buat **template pesan** di WhatsApp Manager → Message templates:
   - Nama: `villa_ai_notifikasi` · Kategori: **Utility** · Bahasa: **Indonesian (id)**
   - Isi: `Notifikasi Villa AI: {{1}}`
   - Tunggu disetujui Meta (biasanya beberapa menit–jam).

**Di Villa AI:** Pengaturan → **Notifikasi WhatsApp**:
- Centang *Aktifkan*, isi Phone number ID, token, nomor penerima (mis. `0812…`), simpan.
- Klik **Kirim pesan tes**. Jika gagal, pesan error dari Meta ditampilkan (mis. token salah, template belum disetujui).

**Yang dikirim:**
| Kapan | Isi |
|---|---|
| Setiap pagi 08:05 WITA (jika ada) | Ringkasan alert ⛔/⚠️ baru dalam 24 jam terakhir |
| Senin pagi | Laporan mingguan: okupansi, pendapatan, laba vs minggu sebelumnya |
| Tanggal 1 | Laporan bulanan |

**Keamanan:** token disimpan **terenkripsi di Supabase Vault**; aplikasi tidak bisa membacanya kembali,
hanya database yang memakainya saat mengirim. Riwayat pengiriman ada di Pengaturan.

**Biaya Meta:** pesan template kategori *Utility* dikenakan biaya per pesan oleh Meta (umumnya beberapa ratus rupiah per pesan
untuk nomor Indonesia; cek tarif terbaru di halaman pricing WhatsApp Business). Versi API default `v23.0` — ubah di Pengaturan jika Meta menghentikan versi tersebut.

---

## 3. Excel & Google Sheets

Pengaturan → **Ekspor ke Excel / Google Sheets**:
- **Unduh CSV**: booking, transaksi, atau KPI bulanan → terbuka langsung di Excel / Google Sheets.
- **Link live Google Sheets** (aplikasi harus sudah online, mis. di Vercel):
  1. Klik **Buat link Google Sheets** → salin rumus `=IMPORTDATA("…")` (ditampilkan sekali).
  2. Tempel di sel A1 sheet kosong. Google memperbarui data otomatis (±1 jam).
  3. **Cabut link** kapan saja → rumus lama berhenti berfungsi.

> Siapa pun yang memegang link bisa membaca datanya — jangan bagikan sheet secara publik.

---

## Status pengujian

| Uji | Hasil |
|---|---|
| Parser iCal (format Airbnb, Booking.com, baris terlipat, tanggal-jam, tanpa UID) | ✅ |
| Ambil kalender iCal sungguhan dari internet (Google Calendar publik) → event tersimpan, catat booking dengan prefill, abaikan, sinkron ulang | ✅ |
| Kirim WhatsApp ke **Graph API Meta asli** dengan token palsu → ditolak dengan pesan jelas ("HTTP 401 – Malformed access token") | ✅ (alur pengiriman bekerja; pengiriman sukses butuh akun Meta kamu) |
| Unduh CSV booking/transaksi/KPI | ✅ |
| Link Google Sheets: bisa diakses tanpa login dengan token, token salah → 403, dicabut → 403, halaman lain tetap wajib login | ✅ |
| Tampilan HP semua halaman baru | ✅ |

## Berikutnya: Fase 5 — Revenue & Market Intelligence

Kalender harga per tanggal, data kompetitor, dan rekomendasi harga dinamis dari AI.
