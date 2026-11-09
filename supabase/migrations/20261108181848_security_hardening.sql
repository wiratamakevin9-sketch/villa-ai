-- =====================================================================
-- VILLA AI — Migrasi 5: Pengetatan keamanan (hasil Supabase Security Advisor)
-- =====================================================================

-- 1) Fungsi trigger dengan search_path tetap
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 2) Pindahkan extension keluar dari schema public
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- 3) Fungsi tidak boleh dipanggil oleh pengunjung yang belum login (anon)
revoke execute on function public.is_org_member(uuid)  from public, anon;
revoke execute on function public.can_write_org(uuid)  from public, anon;
revoke execute on function public.is_org_owner(uuid)   from public, anon;
revoke execute on function public.property_org(uuid)   from public, anon;
revoke execute on function public.create_organization(text) from public, anon;
revoke execute on function public.load_demo_data(uuid)  from public, anon;
revoke execute on function public.clear_demo_data(uuid) from public, anon;

-- Fungsi trigger tidak perlu dipanggil siapa pun lewat API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
