# Online-kan Villa AI ke Vercel (±15 menit)

Setelah selesai, Villa AI bisa dibuka dari HP/laptop mana pun, dan **setiap perubahan yang di-push
ke GitHub otomatis ter-update** di Vercel.

## Langkah 1 — Daftar Vercel
1. Buka <https://vercel.com/signup> → **Continue with GitHub** (pakai akun GitHub yang sama: `wiratamakevin9-sketch`).
2. Pilih paket **Hobby** (gratis).

## Langkah 2 — Import proyek
1. Di dashboard Vercel: **Add New… → Project**.
2. Di "Import Git Repository", cari **villa-ai** → **Import**.
   - Jika repository tidak muncul: klik **Adjust GitHub App Permissions** → beri akses ke repository `villa-ai` → kembali.
3. Framework akan terdeteksi otomatis sebagai **Next.js**. Biarkan pengaturan build apa adanya.

## Langkah 3 — Environment Variables
Masih di layar import, buka **Environment Variables** dan tambahkan:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bgpzogatxbovulzrxzgw.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_euEvctTdwE2Xcb6fRQzo0Q_gAzsUvMF` |
| `ANTHROPIC_API_KEY` | *(API key kamu dari console.anthropic.com — rahasia)* |
| `ANTHROPIC_MODEL` | *(opsional)* `claude-sonnet-5-5` untuk biaya lebih rendah |

> Dua nilai Supabase di atas memang aman untuk publik (dilindungi aturan keamanan database).
> `ANTHROPIC_API_KEY` **rahasia** — hanya diisi di Vercel, jangan dibagikan.

Klik **Deploy**. Tunggu ±2 menit sampai muncul "Congratulations". Alamatnya seperti
`https://villa-ai-xxxx.vercel.app`.

## Langkah 4 — Sambungkan login Supabase ke alamat baru
Supabase → project **villa-ai** → **Authentication → URL Configuration**:
- **Site URL**: `https://villa-ai-xxxx.vercel.app` (alamat dari langkah 3)
- **Redirect URLs** → Add URL: `https://villa-ai-xxxx.vercel.app/**`
- Save.

Ini membuat link konfirmasi email saat daftar mengarah ke aplikasi online, bukan `localhost`.

## Langkah 5 — Coba
1. Buka alamat Vercel → **Daftar** akun kamu sendiri → konfirmasi email → login.
2. Buat bisnis (centang data contoh jika ingin mencoba dulu).
3. Di HP: buka alamatnya di Chrome/Safari → menu **Tambahkan ke Layar Utama** agar terasa seperti aplikasi.
4. Pengaturan → Notifikasi WhatsApp → isi **Link aplikasi** dengan alamat Vercel (ditambahkan di akhir pesan WA).
5. Pengaturan → Ekspor → **Buat link Google Sheets** → sekarang rumus `=IMPORTDATA(...)` bisa dipakai di Google Sheets.

## Setelah ini
- Setiap `git push` ke branch `main` → Vercel otomatis build & update (±2 menit). Status di tab **Deployments**.
- Ganti/menambah environment variable → **Settings → Environment Variables** → lalu **Deployments → Redeploy**.
- Domain sendiri (mis. `app.namavilla.com`): **Settings → Domains**.

## Jika ada masalah
| Gejala | Solusi |
|---|---|
| Build gagal | Buka tab Deployments → klik deployment → **Build Logs**, kirim isinya ke Claude |
| Halaman error setelah login | Cek dua variabel Supabase di langkah 3 sudah benar, lalu Redeploy |
| Asisten AI: "ANTHROPIC_API_KEY belum diisi" | Tambahkan variabelnya di langkah 3, lalu Redeploy |
| Link konfirmasi email membuka localhost | Ulangi langkah 4 |
