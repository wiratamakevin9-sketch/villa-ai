// Me-refresh sesi login di setiap request dan mengarahkan user
// yang belum login ke halaman /login.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/feed dilindungi token rahasia sendiri (dipakai Google Sheets tanpa login)
const PUBLIC_PATHS = ["/login", "/api/feed/"];

const CONFIG_ERROR_HTML = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Konfigurasi belum lengkap</title>
<style>body{font-family:system-ui,sans-serif;background:#f7f6f3;color:#1c1b19;max-width:640px;margin:48px auto;padding:0 16px;line-height:1.5}
code{background:#eee;padding:2px 6px;border-radius:4px}</style></head><body>
<h1>Villa AI: konfigurasi belum lengkap</h1>
<p>Environment variable <code>NEXT_PUBLIC_SUPABASE_URL</code> dan/atau <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> tidak ditemukan saat aplikasi dibangun.</p>
<ol><li>Vercel → Project → <b>Settings → Environment Variables</b>.</li>
<li>Tambahkan kedua variabel untuk environment <b>Production</b> (dan Preview).</li>
<li><b>Deployments</b> → titik tiga pada deployment terbaru → <b>Redeploy</b> (wajib: nilai NEXT_PUBLIC_ dibaca saat build).</li></ol>
</body></html>`;

export async function updateSession(request: NextRequest) {
  // Tanpa konfigurasi Supabase, tampilkan penjelasan alih-alih crash (MIDDLEWARE_INVOCATION_FAILED)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return new NextResponse(CONFIG_ERROR_HTML, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Jika Supabase sedang tidak bisa dihubungi, jangan crash: anggap belum login
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (e) {
    console.error("[middleware] gagal memeriksa sesi:", e);
  }

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
