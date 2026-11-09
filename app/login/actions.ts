"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
  });
  if (error) {
    const msg = error.code === "invalid_credentials"
      ? "Email atau password salah"
      : `Gagal masuk: ${error.message}`;
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email")),
    password: String(formData.get("password")),
    options: { data: { full_name: String(formData.get("full_name") || "") } },
  });
  if (error) redirect(`/login?mode=signup&error=${encodeURIComponent(error.message)}`);
  if (!data.session) {
    redirect(`/login?message=${encodeURIComponent("Cek email kamu untuk konfirmasi akun, lalu login.")}`);
  }
  redirect("/onboarding");
}
