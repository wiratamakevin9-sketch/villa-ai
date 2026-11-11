# Panduan Fase 6 — Operasional & Tim

## Yang baru

### 1. Tugas cleaning otomatis dari booking
- Setiap booking terkonfirmasi → tugas **cleaning** pada hari check-out pukul 11.00 WITA.
- Ubah tanggal booking → tugas ikut pindah. Booking dibatalkan → tugas ikut dibatalkan.
- Jika ada tamu baru **check-in di hari yang sama** → prioritas otomatis **tinggi**
  ("Cleaning check-out (tamu baru check-in hari ini)").
- Tugas otomatis di-assign ke staf **housekeeping** (diutamakan yang ditugaskan di villa tersebut).

### 2. Aset & servis rutin (Villa → Edit → Aset & jadwal servis)
- Catat aset (AC, pompa kolam, water heater, genset…), tanggal servis terakhir, dan interval (hari).
- **7 hari sebelum jatuh tempo** → tugas "Servis rutin: …" dibuat otomatis (prioritas tinggi jika terlambat),
  di-assign ke staf **maintenance/kolam**.
- Tugas servis ditandai selesai → tanggal servis terakhir aset **otomatis diperbarui**.

### 3. Menu Operasional (diperbarui)
- **Papan hari ini**: check-in, check-out, tugas hari ini & terlambat.
- Filter: *Tugas saya*, *Semua*, *Belum di-assign*, per villa.
- Assign petugas, **Mulai**, **Selesai**. Owner/manager bisa mengisi **biaya** saat menyelesaikan tugas →
  otomatis tercatat sebagai pengeluaran villa di Keuangan (kategori sesuai jenis tugas).

### 4. Menu Tim (baru)
- Data staf: peran, villa, nomor WhatsApp, gaji (total gaji bulanan ditampilkan).
- **Akses login** (owner):
  1. Isi email staf/manager → pilih peran → (opsional) hubungkan ke data staf → **Undang**.
  2. Orang tersebut membuka aplikasi → **Daftar** dengan email yang sama → konfirmasi email → klik **Gabung**.
  3. Owner bisa mengubah peran atau **mencabut akses** kapan saja.

| Peran | Bisa melihat |
|---|---|
| Owner | Semua, termasuk Tim & Pengaturan |
| Manager | Semua kecuali mengelola tim & pengaturan bisnis |
| Staf | Hanya **Operasional, Booking, Kalender, Villa**. Tidak bisa melihat keuangan, laporan, harga, persetujuan, atau Asisten AI |

> Pembatasan staf dijaga **di database** (bukan hanya disembunyikan di layar) — sudah diuji: akun staf
> membaca 0 baris transaksi/laporan/persetujuan walau mengakses API langsung.

### 5. Jadwal tugas ke WhatsApp staf (opsional)
Pengaturan → Notifikasi WhatsApp → centang **Kirim jadwal tugas harian ke WhatsApp masing-masing staf**.
Setiap pagi, staf yang punya tugas hari ini (atau terlambat) menerima daftar tugasnya. Nomor diatur di menu Tim.

### 6. Asisten AI
Bisa membaca daftar tugas (terbuka/selesai, terlambat, petugas, biaya), mis.
*"Tugas apa saja yang terlambat minggu ini?"* atau *"Berapa biaya maintenance yang tercatat dari tugas bulan ini?"*

## Status pengujian

| Uji | Hasil |
|---|---|
| Trigger booking → tugas cleaning (buat, pindah tanggal, turnover = prioritas tinggi, batal) | ✅ di database asli |
| Aset jatuh tempo → tugas servis; selesai → tanggal servis diperbarui; tidak dobel | ✅ |
| Tim: tambah staf, undang login, staf mendaftar & bergabung | ✅ |
| Operasional: assign, selesaikan dengan biaya → tercatat di Keuangan | ✅ |
| Akun staf: menu terbatas, halaman keuangan/laporan/AI dialihkan, ekspor CSV ditolak (403), API database menolak data keuangan | ✅ |
| Tampilan HP staf | ✅ |

## Berikutnya: Fase 7 — Advanced
Integrasi channel manager (kirim harga & ketersediaan ke semua OTA otomatis), forecasting pendapatan,
WhatsApp dua arah untuk tamu, dan laporan multi-properti lanjutan.
