-- =====================================================================
-- VILLA AI — Migrasi 2: Keamanan (Row Level Security)
-- ---------------------------------------------------------------------
-- Aturan akses:
--   owner   : baca + tulis semua data organisasi, kelola anggota
--   manager : baca + tulis semua data organisasi
--   staff   : baca data, dan boleh mengubah status tugas (tasks)
-- Database sendiri yang menolak akses ke data organisasi lain,
-- jadi meskipun ada bug di aplikasi, data tetap aman.
-- =====================================================================

-- ---------- Fungsi bantu ----------
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function public.can_write_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'manager')
  );
$$;

create or replace function public.is_org_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships
    where org_id = p_org and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.property_org(p_property uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.properties where id = p_property;
$$;

-- ---------- Aktifkan RLS di semua tabel ----------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Tabel yang punya kolom org_id ----------
do $$
declare t text;
begin
  foreach t in array array[
    'properties', 'channels', 'guests', 'competitors', 'categories',
    'transactions', 'staff', 'alerts', 'approvals', 'reports', 'documents'
  ]
  loop
    execute format('create policy "%1$s: anggota bisa baca" on public.%1$I
                    for select to authenticated using (public.is_org_member(org_id))', t);
    execute format('create policy "%1$s: owner/manager bisa tambah" on public.%1$I
                    for insert to authenticated with check (public.can_write_org(org_id))', t);
    execute format('create policy "%1$s: owner/manager bisa ubah" on public.%1$I
                    for update to authenticated using (public.can_write_org(org_id))
                    with check (public.can_write_org(org_id))', t);
    execute format('create policy "%1$s: owner/manager bisa hapus" on public.%1$I
                    for delete to authenticated using (public.can_write_org(org_id))', t);
  end loop;
end $$;

-- ---------- Tabel yang terikat ke properti (property_id) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'bookings', 'seasons', 'rate_calendar', 'rate_change_log', 'budgets', 'tasks', 'assets'
  ]
  loop
    execute format('create policy "%1$s: anggota bisa baca" on public.%1$I
                    for select to authenticated using (public.is_org_member(public.property_org(property_id)))', t);
    execute format('create policy "%1$s: owner/manager bisa tambah" on public.%1$I
                    for insert to authenticated with check (public.can_write_org(public.property_org(property_id)))', t);
    execute format('create policy "%1$s: owner/manager bisa ubah" on public.%1$I
                    for update to authenticated using (public.can_write_org(public.property_org(property_id)))
                    with check (public.can_write_org(public.property_org(property_id)))', t);
    execute format('create policy "%1$s: owner/manager bisa hapus" on public.%1$I
                    for delete to authenticated using (public.can_write_org(public.property_org(property_id)))', t);
  end loop;
end $$;

-- Staf boleh memperbarui tugas (mis. tandai cleaning selesai)
create policy "tasks: staf bisa update tugas" on public.tasks
  for update to authenticated
  using (public.is_org_member(public.property_org(property_id)))
  with check (public.is_org_member(public.property_org(property_id)));

-- ---------- Harga kompetitor (lewat tabel competitors) ----------
create policy "competitor_rates: anggota bisa baca" on public.competitor_rates
  for select to authenticated using (exists (
    select 1 from public.competitors c where c.id = competitor_id and public.is_org_member(c.org_id)));
create policy "competitor_rates: owner/manager bisa kelola" on public.competitor_rates
  for all to authenticated
  using (exists (select 1 from public.competitors c where c.id = competitor_id and public.can_write_org(c.org_id)))
  with check (exists (select 1 from public.competitors c where c.id = competitor_id and public.can_write_org(c.org_id)));

-- ---------- Organisasi ----------
create policy "organizations: anggota bisa baca" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "organizations: owner bisa ubah" on public.organizations
  for update to authenticated using (public.is_org_owner(id)) with check (public.is_org_owner(id));
-- (Membuat organisasi baru lewat fungsi create_organization di bawah.)

-- ---------- Keanggotaan ----------
create policy "memberships: anggota bisa lihat tim" on public.memberships
  for select to authenticated using (public.is_org_member(org_id));
create policy "memberships: owner kelola tim" on public.memberships
  for all to authenticated using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));

-- ---------- Profil ----------
create policy "profiles: lihat profil sendiri & rekan tim" on public.profiles
  for select to authenticated using (
    id = auth.uid() or exists (
      select 1 from public.memberships m1
      join public.memberships m2 on m1.org_id = m2.org_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy "profiles: ubah profil sendiri" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Percakapan AI: hanya milik user sendiri ----------
create policy "conversations: milik sendiri" on public.conversations
  for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(org_id))
  with check (user_id = auth.uid() and public.is_org_member(org_id));
create policy "messages: milik sendiri" on public.messages
  for all to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- ---------- Audit log: hanya bisa dibaca owner, ditulis oleh sistem ----------
create policy "audit_log: owner bisa baca" on public.audit_log
  for select to authenticated using (public.is_org_owner(org_id));

-- =====================================================================
-- Fungsi: buat organisasi baru + jadikan pembuatnya owner
--         + isi channel & kategori default
-- =====================================================================
create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Harus login terlebih dahulu';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nama bisnis wajib diisi';
  end if;

  insert into public.organizations (name) values (trim(p_name)) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, auth.uid(), 'owner');

  -- Channel penjualan default (komisi bisa diubah nanti)
  insert into public.channels (org_id, name, type, commission_pct) values
    (v_org, 'Direct / WhatsApp', 'direct', 0),
    (v_org, 'Airbnb',            'ota',    15),
    (v_org, 'Booking.com',       'ota',    15),
    (v_org, 'Agoda',             'ota',    15),
    (v_org, 'Travel Agent',      'agent',  10);

  -- Kategori keuangan default
  insert into public.categories (org_id, name, type, group_name, is_fixed) values
    (v_org, 'Gaji Staf',             'expense', 'SDM',         true),
    (v_org, 'Listrik',               'expense', 'Utilitas',    false),
    (v_org, 'Air',                   'expense', 'Utilitas',    false),
    (v_org, 'Internet',              'expense', 'Utilitas',    true),
    (v_org, 'Kebersihan & Laundry',  'expense', 'Operasional', false),
    (v_org, 'Amenities Tamu',        'expense', 'Operasional', false),
    (v_org, 'Perawatan Kolam',       'expense', 'Operasional', false),
    (v_org, 'Maintenance & Perbaikan','expense','Operasional', false),
    (v_org, 'Marketing & Iklan',     'expense', 'Marketing',   false),
    (v_org, 'Pajak & Retribusi',     'expense', 'Pajak',       false),
    (v_org, 'Lain-lain',             'expense', 'Lainnya',     false),
    (v_org, 'Layanan Tambahan',      'income',  'Pendapatan Lain', false),
    (v_org, 'Pendapatan Lain',       'income',  'Pendapatan Lain', false);

  insert into public.audit_log (org_id, actor, action, entity, entity_id)
  values (v_org, auth.uid(), 'create', 'organization', v_org::text);

  return v_org;
end $$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
