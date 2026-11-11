# Panduan Fase 7 — Advanced

Fase 7 dibagi dua:

- **7A (selesai):** Forecast pendapatan & laba, halaman Portofolio multi-villa.
- **7B (butuh keputusan & akun pihak ketiga):** channel manager, WhatsApp dua arah untuk tamu.

## 7A — Menu Portofolio

### Peringkat villa (3 / 6 / 12 bulan penuh terakhir)
Okupansi, ADR, RevPAR, **Indeks RevPAR** (100 = rata-rata portofolio), pendapatan, laba setelah biaya bersama,
margin, laba per malam tersedia, ROI tahunan, dan porsi booking **direct** (tanpa komisi OTA).

Cara membaca: villa dengan indeks < 100 menghasilkan pendapatan per malam di bawah rata-rata — kandidat
untuk dievaluasi harga, foto/listing, atau promosi. Porsi direct yang rendah = potensi menghemat komisi.

### Forecast 3 bulan ke depan
Per villa per bulan: **sudah dipesan** + **perkiraan tambahan**, okupansi, pendapatan, laba, dan **keyakinan**.

| Langkah | Penjelasan |
|---|---|
| Sudah dipesan | Malam & pendapatan dari booking tercatat |
| Permintaan historis | Okupansi 180 hari terakhir × malam tersedia |
| Pola pemesanan | Persen malam yang biasanya sudah dipesan pada jarak hari yang sama (12 bulan terakhir) |
| Pace | Booking masuk lebih cepat/lambat dari biasa → perkiraan disesuaikan 0,5–1,5× |
| Harga | Malam tambahan dihargai sesuai kalender harga (Fase 5) |
| Batas | Total maks. 15% di atas permintaan historis (kecuali sudah dipesan lebih) |
| Pengeluaran | Rata-rata 3 bulan terakhir + bagian biaya bersama |

Keyakinan **tinggi** = sebagian besar booking bulan itu biasanya sudah masuk; **rendah** = masih jauh, angka bisa berubah banyak.
Forecast menjadi lebih akurat seiring bertambahnya data booking asli (minimal ±3–6 bulan).

Asisten AI juga bisa membaca forecast: *"Berapa perkiraan laba Desember? Villa mana yang perlu promosi?"*

## 7B — Rencana (menunggu keputusan)

### Channel manager
Satu-satunya cara resmi untuk mengirim **harga & ketersediaan otomatis** ke Airbnb, Booking.com, Agoda
(API OTA hanya untuk partner resmi). Villa AI akan terhubung ke API channel manager:
- Kirim harga dari kalender harga Villa AI → semua OTA.
- Terima booking lengkap (nama tamu, harga, komisi) → tercatat otomatis, menggantikan iCal.

Yang perlu kamu lakukan: pilih & berlangganan satu channel manager yang punya API (mis. Channex, Beds24),
hubungkan ke akun OTA, lalu buat API key.

### WhatsApp dua arah untuk tamu
Pesan tamu masuk ke kotak masuk Villa AI, dicocokkan dengan booking, AI menyiapkan draf balasan
(info check-in, arah lokasi, jawaban FAQ) yang kamu setujui sebelum terkirim. Memakai akun WhatsApp Cloud API yang sama dengan Fase 4.
