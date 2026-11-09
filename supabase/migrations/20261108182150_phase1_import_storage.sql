-- =====================================================================
-- VILLA AI — Migrasi 6 (Fase 1): impor booking CSV + penyimpanan foto nota
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Impor booking massal dari CSV (Airbnb / Booking.com / Agoda / template)
--    * security invoker → tetap tunduk pada RLS user yang login
--    * setiap baris diproses sendiri: satu baris gagal tidak membatalkan yang lain
--    * duplikat (kode booking OTA sama) dilewati, jadi file yang sama aman diimpor ulang
-- ---------------------------------------------------------------------
create or replace function public.import_bookings(p_property uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_org      uuid := public.property_org(p_property);
  v_row      jsonb;
  v_idx      int := 0;
  v_results  jsonb := '[]'::jsonb;
  v_channel  record;
  v_guest    uuid;
  v_gross    numeric;
  v_comm     numeric;
  v_ref      text;
  v_name     text;
begin
  if v_org is null or not public.can_write_org(v_org) then
    raise exception 'Tidak punya akses ke villa ini';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    begin
      v_ref  := nullif(trim(v_row ->> 'external_ref'), '');
      v_name := coalesce(nullif(trim(v_row ->> 'guest_name'), ''), 'Tamu');

      if v_ref is not null and exists (
        select 1 from public.bookings where property_id = p_property and external_ref = v_ref
      ) then
        v_results := v_results || jsonb_build_object('row', v_idx, 'status', 'duplicate',
                       'message', 'Sudah ada (kode ' || v_ref || ')');
        continue;
      end if;

      select id, commission_pct into v_channel from public.channels
      where org_id = v_org and lower(name) = lower(trim(v_row ->> 'channel_name'))
      limit 1;

      v_gross := coalesce((v_row ->> 'gross_amount')::numeric, 0);
      v_comm  := coalesce((v_row ->> 'commission_amount')::numeric,
                          round(v_gross * coalesce(v_channel.commission_pct, 0) / 100, 0));

      select id into v_guest from public.guests
      where org_id = v_org and lower(name) = lower(v_name)
        and coalesce(phone, '') = coalesce(nullif(trim(v_row ->> 'guest_phone'), ''), '')
      limit 1;
      if v_guest is null then
        insert into public.guests (org_id, name, phone, email, country)
        values (v_org, v_name, nullif(trim(v_row ->> 'guest_phone'), ''),
                nullif(trim(v_row ->> 'guest_email'), ''), nullif(trim(v_row ->> 'guest_country'), ''))
        returning id into v_guest;
      end if;

      insert into public.bookings (property_id, guest_id, channel_id, external_ref, check_in, check_out,
                                   guests_count, gross_amount, commission_amount, status, source, notes)
      values (p_property, v_guest, v_channel.id, v_ref,
              (v_row ->> 'check_in')::date, (v_row ->> 'check_out')::date,
              nullif(v_row ->> 'guests_count', '')::int,
              v_gross, v_comm,
              coalesce(nullif(v_row ->> 'status', ''),
                       case when (v_row ->> 'check_out')::date <= current_date then 'completed' else 'confirmed' end),
              'import', nullif(v_row ->> 'notes', ''));

      v_results := v_results || jsonb_build_object('row', v_idx, 'status', 'ok');
    exception
      when exclusion_violation then
        v_results := v_results || jsonb_build_object('row', v_idx, 'status', 'conflict',
                       'message', 'Tanggal bentrok dengan booking lain');
      when others then
        v_results := v_results || jsonb_build_object('row', v_idx, 'status', 'error', 'message', sqlerrm);
    end;
  end loop;

  insert into public.audit_log (org_id, actor, action, entity, entity_id, diff)
  values (v_org, auth.uid(), 'import', 'bookings', p_property::text,
          jsonb_build_object('rows', jsonb_array_length(p_rows)));

  return v_results;
end $$;

revoke execute on function public.import_bookings(uuid, jsonb) from public, anon;
grant execute on function public.import_bookings(uuid, jsonb) to authenticated;

-- audit_log hanya bisa ditulis lewat fungsi; izinkan insert dari fungsi invoker di atas
create policy "audit_log: anggota bisa menulis log" on public.audit_log
  for insert to authenticated with check (public.is_org_member(org_id) and actor = auth.uid());

-- ---------------------------------------------------------------------
-- 2) Penyimpanan foto nota / invoice (privat)
--    Struktur path: <org_id>/<tahun-bulan>/<nama-file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "receipts: anggota bisa lihat" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.org_id::text = (storage.foldername(name))[1]));

create policy "receipts: owner/manager bisa upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role in ('owner', 'manager')
      and m.org_id::text = (storage.foldername(name))[1]));

create policy "receipts: owner/manager bisa hapus" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role in ('owner', 'manager')
      and m.org_id::text = (storage.foldername(name))[1]));
