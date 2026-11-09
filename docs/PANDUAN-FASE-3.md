# Panduan Fase 3 — Sistem Proaktif

Villa AI sekarang **bekerja sendiri tanpa ditanya**: mengecek kondisi bisnis setiap pagi,
membuat laporan berkala, dan AI bisa **mengusulkan aksi** yang kamu setujui dengan satu klik.

## Yang berjalan otomatis (di database Supabase, tanpa server tambahan)

| Kapan | Apa |
|---|---|
| Setiap hari 08:05 WITA | Cek aturan bisnis → buat **alert** (tanpa duplikat) |
| Setiap Senin 08:15 WITA | **Laporan mingguan** (Senin–Minggu lalu) |
| Setiap tanggal 1, 08:25 WITA | **Laporan bulanan** (bulan lalu) |

Jadwal dijalankan oleh `pg_cron` di Supabase. Bisa dilihat di Supabase → Integrations → Cron.

## Aturan alert

| Alert | Kapan muncul | Tingkat |
|---|---|---|
| Okupansi ke depan rendah | Okupansi 30 hari ke depan < 50% (< 30% = kritis). Selesai otomatis jika pulih | ⚠️ / ⛔ |
| Pengeluaran tidak wajar | Kategori ≥ 2× rata-rata 3 bulan **dan** selisih ≥ Rp 1 jt (≥ 4× = kritis) | ⚠️ / ⛔ |
| Okupansi turun | Okupansi bulan lalu turun ≥ 15 poin dari bulan sebelumnya | ⚠️ |
| Rugi bulanan | Laba bersih villa bulan lalu negatif | ⛔ |
| Celah booking | Celah 1–2 malam di antara booking (45 hari ke depan) — sulit terjual tanpa promo/min-stay | ℹ️ |
| Servis aset | Jadwal servis aset (AC, pompa, dll.) jatuh tempo ≤ 7 hari | ℹ️ |

Ambang batas bisa diubah di `supabase/migrations/…_phase3_alerts_reports.sql` (fungsi `generate_alerts`).

## Menu baru

- **Alert** — daftar alert (angka di menu = alert penting yang belum dibaca).
  - **✦ Jelaskan & beri saran (AI)**: AI menjelaskan penyebab dan tindakan, berdasarkan data villa terkait.
  - **Cek sekarang**: jalankan pengecekan tanpa menunggu besok pagi.
- **Laporan** — laporan mingguan/bulanan: KPI vs periode sebelumnya, per villa, channel,
  pengeluaran terbesar, okupansi ke depan.
  - **Buat ringkasan AI**: ringkasan eksekutif + 3 rekomendasi.
  - **Cetak / simpan PDF**: tampilan cetak tanpa menu.
- **Persetujuan** — usulan aksi dari Asisten AI. **Tidak ada yang dijalankan sebelum kamu klik "Setujui"**.
  - *Buat tugas* → masuk menu Operasional.
  - *Ubah harga dasar* → harga villa berubah + tercatat di log perubahan harga.
- **Operasional** — daftar tugas (cleaning, maintenance, inspeksi, pembelian), tandai Mulai/Selesai.
- **Ringkasan** — kotak "Perlu perhatian" berisi alert penting teratas.

Contoh ke Asisten AI: *"Biaya maintenance Villa Pantai Biru tinggi, usulkan tugas servis rutin"*
atau *"Okupansi Januari rendah, usulkan harga dasar baru untuk Villa Tebing Senja"*.

## Status pengujian

| Uji | Hasil |
|---|---|
| Fungsi alert, laporan, dan job terjadwal di database Supabase asli | ✅ 8 alert dari data contoh, dijalankan ulang = 0 duplikat; laporan Oktober cocok dengan dashboard (okupansi 60,2%, laba Rp 137 jt) |
| Alur aplikasi lengkap (alert, penjelasan AI, laporan + ringkasan AI, AI mengusulkan 2 aksi, setujui → tugas dibuat & harga berubah + log, tampilan HP) memakai server tiruan Claude | ✅ lolos |
| Claude API asli | ⏳ perlu API key kamu (lihat PANDUAN-FASE-2) |

## Biaya tambahan

- Pengecekan & laporan: **gratis** (SQL di Supabase).
- AI hanya dipanggil saat kamu klik "Jelaskan" atau "Buat ringkasan AI": kira-kira Rp 500–3.000 per klik.

## Saran keamanan (sekali klik)

Supabase → Authentication → Attack Protection → aktifkan **Leaked password protection**
(menolak password yang pernah bocor di internet).

## Berikutnya: Fase 4 — Integrasi

Sinkron kalender OTA (iCal), Google Sheets, dan **notifikasi WhatsApp** (alert & laporan dikirim ke HP).
