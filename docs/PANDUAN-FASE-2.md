# Panduan Fase 2 — Asisten AI

Menu baru **✦ Asisten AI**: chat dengan AI yang membaca data bisnis kamu (booking, keuangan,
okupansi), lalu menjelaskan temuan dan memberi rekomendasi **beserta alasannya**.

## Aktifkan (5 menit)

1. Buka <https://console.anthropic.com> → daftar/login → **Billing**: isi saldo (mis. $10–20 untuk mulai).
2. **API Keys → Create Key**, beri nama `villa-ai`, salin key-nya.
3. Buka file `.env.local` di folder proyek, isi:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
4. Hentikan aplikasi (Ctrl+C) lalu jalankan lagi:
   ```bash
   npm run dev
   ```
5. Buka menu **✦ Asisten AI** dan klik salah satu contoh pertanyaan.

> Jika nanti online di Vercel: tambahkan `ANTHROPIC_API_KEY` di
> Project → Settings → Environment Variables, lalu Redeploy.
> **Jangan** pernah membagikan key ini atau menempelkannya di chat.

## Yang bisa ditanyakan

| Jenis | Contoh |
|---|---|
| Performa | "Bagaimana performa 3 bulan terakhir dibanding 3 bulan sebelumnya?" |
| Perbandingan villa | "Villa mana paling menguntungkan dan kenapa?" |
| Okupansi | "Okupansi 60 hari ke depan bagaimana? Apa yang harus saya lakukan?" |
| Channel | "Channel mana paling menguntungkan setelah komisi? Perlu dorong direct booking?" |
| Biaya | "Apakah ada pengeluaran tidak wajar bulan ini?" |
| Investasi | "Berapa ROI tiap villa dan kapan balik modal?" |
| Riset pasar | "Riset harga villa 3 kamar di Canggu untuk Desember, bandingkan dengan harga saya." |
| Tamu | "Dari negara mana tamu saya paling banyak, dan berapa lama mereka booking sebelumnya?" |

## Cara kerjanya

```
Pertanyaan → Claude memilih data yang perlu dibaca → tool mengambil angka dari database
          → Claude menganalisis → jawaban + rekomendasi (streaming ke layar)
```

- **8 tool data** (hanya membaca): daftar villa, KPI bulanan, okupansi ke depan, performa channel,
  rincian pengeluaran, deteksi pengeluaran tidak wajar, daftar booking, ROI.
  Ditambah **web search** untuk riset kompetitor & tren.
- **Angka dihitung oleh database/kode**, bukan dikarang AI. AI membaca hasilnya lalu menjelaskan.
- **Aman:** tool berjalan dengan akses user yang login. AI tidak bisa melihat data bisnis lain
  dan **tidak bisa mengubah data apa pun** di Fase 2.
- Percakapan tersimpan dan bisa dilanjutkan (menu Riwayat di kanan).

## Biaya

Setiap pertanyaan biasanya membaca 1–4 tool. Perkiraan kasar dengan model default
(Claude Opus 5.5): **sekitar Rp 1.000–5.000 per pertanyaan**, lebih tinggi bila memakai web search
atau percakapan sangat panjang. Pantau pemakaian di console.anthropic.com → Usage, dan pasang
batas belanja bulanan di sana.

Untuk menghemat:
- `ANTHROPIC_MODEL=claude-sonnet-5-5` di `.env.local` (±50% lebih murah, tetap bagus untuk analisis rutin).
- `ANTHROPIC_EFFORT=low` untuk jawaban lebih cepat dan hemat.
- Mulai **percakapan baru** untuk topik baru (riwayat panjang ikut dikirim setiap pertanyaan).

## Status pengujian

| Uji | Hasil |
|---|---|
| 8 tool data terhadap database Supabase asli (login sebagai user, RLS aktif) | ✅ semua benar, input salah ditolak dengan pesan jelas |
| Alur agent lengkap (streaming, 2 tool paralel, jawaban, pertanyaan lanjutan, riwayat tersimpan, tampilan HP) memakai **server tiruan** Claude API | ✅ lolos |
| Panggilan ke **Claude API asli** | ⏳ belum (perlu API key kamu). Lakukan langkah "Aktifkan" di atas, lalu coba 2–3 pertanyaan contoh |

## Berikutnya: Fase 3 — Proaktif

Alert otomatis (okupansi turun, biaya tidak wajar), laporan mingguan/bulanan otomatis,
dan antrean persetujuan untuk aksi yang diusulkan AI.
