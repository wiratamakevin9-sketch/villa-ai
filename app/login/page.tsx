import Link from "next/link";
import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string }>;
}) {
  const { mode, error, message } = await searchParams;
  const isSignup = mode === "signup";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold">Villa AI</h1>
        <p className="mb-6 text-sm text-stone-500">
          {isSignup ? "Buat akun baru" : "Masuk ke dashboard bisnis villa"}
        </p>

        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        <form className="space-y-4">
          {isSignup && (
            <div>
              <label className="label" htmlFor="full_name">Nama lengkap</label>
              <input className="input" id="full_name" name="full_name" required />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" minLength={8} required />
          </div>
          <button className="btn w-full" formAction={isSignup ? signup : login}>
            {isSignup ? "Daftar" : "Masuk"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-500">
          {isSignup ? (
            <>Sudah punya akun? <Link className="text-emerald-700 underline" href="/login">Masuk</Link></>
          ) : (
            <>Belum punya akun? <Link className="text-emerald-700 underline" href="/login?mode=signup">Daftar</Link></>
          )}
        </p>
      </div>
    </main>
  );
}
