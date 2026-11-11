# Panduan Fase 5 — Revenue & Market Intelligence

Menu baru **Harga** dengan dua tab:

1. **Kalender harga & rekomendasi** — harga per tanggal, rekomendasi otomatis + alasannya, atur harga.
2. **Kompetitor & riset pasar** — data harga kompetitor (manual atau riset AI di web).

> ⚠️ Karena belum memakai channel manager, harga di Villa AI adalah **panduan internal**.
> Setelah mengubah harga, perbarui juga di Airbnb / Booking.com / Agoda (otomatis di fase channel manager).

## Cara harga dihitung

**Harga berlaku** per tanggal = harga khusus (jika kamu atur) → kalau tidak ada: **harga dasar × pengali musim**.

**Rekomendasi** dihitung setiap pagi (08:05 WITA) untuk 90 hari ke depan, hanya untuk tanggal yang **belum dipesan**:

| Faktor | Efek |
|---|---|
| Musim (low/shoulder/high/peak) | × pengali musim |
| Akhir pekan (malam Jumat & Sabtu) | +10% |
| Permintaan sekitar (±3 hari) terisi ≥80% / ≥60% | +10% / +5% |
| Last-minute: ≤7 / ≤14 hari lagi **dan** okupansi 30 hari < 50% | −15% / −10% |
| Okupansi 90 hari terakhir ≥80% / <40% | +5% / −5% |
| Median harga kompetitor (villa dengan jumlah kamar sama) | rekomendasi dijaga dalam ±15% dari median |
| Batas harga minimum & maksimum villa | default 60%–200% harga dasar; ubah di Villa → Edit |

Hasil dibulatkan ke Rp 50.000. Alasan setiap rekomendasi ditampilkan (arahkan kursor ke tanggal di kalender).

## Menggunakan

- **Terapkan rekomendasi**: centang tanggal (selisih ≥10% sudah tercentang) → *Terapkan yang dicentang*.
- **Atur harga tanggal**: isi rentang tanggal, harga, minimal malam (mis. promo low season, harga event).
- **Hapus harga khusus**: kembalikan rentang tanggal ke harga dasar × musim.
- **Kompetitor**: tambah kompetitor & catat harganya, atau klik **✦ Mulai riset** —
  AI mencari villa sebanding di web (±1–2 menit), menyimpan harga yang ditemukan beserta link sumber,
  menulis ringkasan pasar, lalu rekomendasi dihitung ulang dengan median kompetitor.
- **Alert "peluang harga"** muncul jika ≥3 tanggal (30 hari ke depan) punya rekomendasi berbeda ≥15%.
- **Asisten AI** kini bisa membaca kalender harga & data kompetitor, dan **mengusulkan harga per rentang tanggal**
  (masuk menu Persetujuan). Contoh: *"Okupansi Januari Villa Sawah Indah rendah, buat usulan promo."*

## Status pengujian

| Uji | Hasil |
|---|---|
| Mesin rekomendasi di database Supabase asli (142 tanggal untuk 3 villa contoh) | ✅ |
| Kalender harga, terapkan rekomendasi, atur & hapus harga khusus (dengan min-stay) | ✅ |
| Riset kompetitor AI → listing tersimpan → median kompetitor dipakai rekomendasi | ✅ (dengan server tiruan Claude) |
| Asisten mengusulkan harga per tanggal → disetujui → berlaku di kalender | ✅ (dengan server tiruan Claude) |
| Batas harga min/maks, tampilan HP | ✅ |
| Riset web dengan Claude asli | ⏳ perlu `ANTHROPIC_API_KEY` |

Perbaikan ikut dalam fase ini: format Rupiah singkat kini menampilkan 1 desimal
(sebelumnya Rp 1,5 jt tertulis "Rp 2 jt").

## Biaya

- Kalender & rekomendasi: **gratis** (dihitung di database).
- Riset AI: memakai web search (beberapa pencarian per riset) + token model. Jalankan seperlunya,
  mis. seminggu sekali per villa atau sebelum musim ramai.

## Berikutnya: Fase 6 — Operasional

Tugas cleaning otomatis dari booking, jadwal servis aset, manajemen staf & akses staf (role).
