-- =====================================================================
-- VILLA AI — Fase 6: Operasional
--   * Tugas cleaning otomatis dari booking (trigger)
--   * Aset → tugas servis otomatis; tugas selesai → tanggal servis diperbarui
--   * Staf per villa, undangan login staf/manager
--   * Data keuangan hanya untuk owner/manager (staf tidak bisa membaca)
--   * Jadwal tugas harian ke WhatsApp staf
-- =====================================================================

alter table public.staff add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.tasks add column if not exists asset_id uuid references public.assets(id) on delete set null;
alter table public.tasks add column if not exists auto_key text;
create unique index if not exists tasks_auto_key on public.tasks (auto_key);
alter table public.notification_settings add column if not exists notify_staff_tasks boolean not null default false;

-- Nomor HP → format internasional (0812… → 62812…)
create or replace function public.normalize_phone(p text)
returns text language sql immutable set search_path = '' as $$
  select case when d like '0%' then '62' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- ---------------------------------------------------------------------
-- 1) Tugas cleaning otomatis dari booking
-- ---------------------------------------------------------------------
create or replace function public.sync_booking_cleaning()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_turnover boolean; v_staff uuid; v_org uuid;
begin
  if tg_op = 'DELETE' then
    update public.tasks set status = 'cancelled' where auto_key = 'clean:' || old.id and status = 'todo';
    return old;
  end if;

  if new.status in ('confirmed', 'checked_in', 'completed') and new.check_out >= public.local_today() - 1 then
    select org_id into v_org from public.properties where id = new.property_id;
    v_turnover := exists (select 1 from public.bookings b where b.property_id = new.property_id and b.id <> new.id
                          and b.check_in = new.check_out and b.status in ('confirmed', 'checked_in'));
    select s.id into v_staff from public.staff s
    where s.org_id = v_org and s.active and s.role = 'housekeeping'
    order by (s.property_id = new.property_id) desc nulls last, s.created_at limit 1;

    insert into public.tasks (property_id, booking_id, type, title, due_at, priority, assigned_to, auto_key)
    values (new.property_id, new.id, 'cleaning',
            case when v_turnover then 'Cleaning check-out (tamu baru check-in hari ini)' else 'Cleaning setelah check-out' end,
            (new.check_out + time '11:00') at time zone 'Asia/Makassar',
            case when v_turnover then 'high' else 'normal' end, v_staff, 'clean:' || new.id)
    on conflict (auto_key) do update
      set property_id = excluded.property_id, due_at = excluded.due_at, priority = excluded.priority, title = excluded.title,
          status = case when public.tasks.status = 'cancelled' then 'todo' else public.tasks.status end;

    -- booking lain yang check-out di hari check-in booking ini → jadi turnover (prioritas tinggi)
    update public.tasks t set priority = 'high', title = 'Cleaning check-out (tamu baru check-in hari ini)'
    from public.bookings b
    where b.property_id = new.property_id and b.check_out = new.check_in and b.id <> new.id
      and t.auto_key = 'clean:' || b.id and t.status = 'todo' and t.priority <> 'urgent';
  else
    update public.tasks set status = 'cancelled' where auto_key = 'clean:' || new.id and status = 'todo';
  end if;
  return new;
end $$;
revoke execute on function public.sync_booking_cleaning() from public, anon, authenticated;

create trigger trg_booking_cleaning
  after insert or update of status, check_in, check_out, property_id or delete on public.bookings
  for each row execute function public.sync_booking_cleaning();

-- Isi tugas cleaning untuk booking yang sudah ada (belum check-out)
insert into public.tasks (property_id, booking_id, type, title, due_at, priority, auto_key)
select b.property_id, b.id, 'cleaning', 'Cleaning setelah check-out',
       (b.check_out + time '11:00') at time zone 'Asia/Makassar', 'normal', 'clean:' || b.id
from public.bookings b
where b.status in ('confirmed', 'checked_in') and b.check_out >= public.local_today()
  and not exists (select 1 from public.tasks t where t.property_id = b.property_id and t.type = 'cleaning'
                  and t.due_at::date = b.check_out and t.status <> 'cancelled')
on conflict (auto_key) do nothing;

-- ---------------------------------------------------------------------
-- 2) Aset: tugas servis otomatis & tanggal servis diperbarui saat selesai
-- ---------------------------------------------------------------------
create or replace function public.generate_ops_tasks(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_orgs uuid[]; v_n int;
begin
  if p_org is null then
    if auth.uid() is not null then raise exception 'Sebutkan organisasi'; end if;
    select coalesce(array_agg(id), '{}') into v_orgs from public.organizations;
  else
    if auth.uid() is not null and not public.can_write_org(p_org) then raise exception 'Tidak punya akses'; end if;
    v_orgs := array[p_org];
  end if;

  insert into public.tasks (property_id, asset_id, type, title, due_at, priority, assigned_to, auto_key)
  select a.property_id, a.id, 'maintenance', 'Servis rutin: ' || a.name,
         ((a.last_service_at + a.service_interval_days) + time '09:00') at time zone 'Asia/Makassar',
         case when a.last_service_at + a.service_interval_days < public.local_today() then 'high' else 'normal' end,
         (select s.id from public.staff s where s.org_id = p.org_id and s.active and s.role in ('maintenance', 'teknisi', 'pool')
          order by (s.property_id = a.property_id) desc nulls last, s.created_at limit 1),
         format('asset:%s:%s', a.id, a.last_service_at + a.service_interval_days)
  from public.assets a join public.properties p on p.id = a.property_id
  where p.org_id = any(v_orgs) and p.status = 'active'
    and a.last_service_at is not null and a.service_interval_days is not null
    and a.last_service_at + a.service_interval_days <= public.local_today() + 7
  on conflict (auto_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.generate_ops_tasks(uuid) from public, anon;
grant execute on function public.generate_ops_tasks(uuid) to authenticated;

create or replace function public.on_task_done()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    if new.asset_id is not null then
      update public.assets set last_service_at = (new.completed_at at time zone 'Asia/Makassar')::date where id = new.asset_id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.on_task_done() from public, anon, authenticated;
create trigger trg_task_done before update of status on public.tasks
  for each row execute function public.on_task_done();

-- ---------------------------------------------------------------------
-- 3) Undangan login staf / manager
--    Orang yang diundang mendaftar dengan email yang sama → konfirmasi email → terima undangan.
-- ---------------------------------------------------------------------
create table public.org_invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  email        text not null check (email = lower(trim(email)) and email like '%@%'),
  role         text not null check (role in ('manager', 'staff')),
  staff_id     uuid references public.staff(id) on delete set null,
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (org_id, email)
);
alter table public.org_invites enable row level security;
create policy "org_invites: owner kelola" on public.org_invites for all to authenticated
  using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));

create or replace function public.my_pending_invites()
returns table (id uuid, org_name text, role text)
language sql stable security definer set search_path = '' as $$
  select i.id, o.name, i.role
  from public.org_invites i join public.organizations o on o.id = i.org_id
  join auth.users u on u.id = auth.uid()
  where i.accepted_at is null and i.email = lower(u.email) and u.email_confirmed_at is not null
    and not exists (select 1 from public.memberships m where m.org_id = i.org_id and m.user_id = u.id);
$$;
revoke execute on function public.my_pending_invites() from public, anon;
grant execute on function public.my_pending_invites() to authenticated;

create or replace function public.accept_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.org_invites; v_email text; v_confirmed timestamptz;
begin
  select lower(email), email_confirmed_at into v_email, v_confirmed from auth.users where id = auth.uid();
  select * into v_inv from public.org_invites where id = p_invite and accepted_at is null;
  if v_inv.id is null or v_inv.email <> v_email then raise exception 'Undangan tidak ditemukan untuk email ini'; end if;
  if v_confirmed is null then raise exception 'Konfirmasi email terlebih dahulu'; end if;
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, auth.uid(), v_inv.role)
  on conflict (org_id, user_id) do nothing;
  if v_inv.staff_id is not null then
    update public.staff set user_id = auth.uid() where id = v_inv.staff_id and org_id = v_inv.org_id;
  end if;
  update public.org_invites set accepted_at = now() where id = p_invite;
  insert into public.audit_log (org_id, actor, action, entity, entity_id)
  values (v_inv.org_id, auth.uid(), 'accept_invite', 'membership', auth.uid()::text);
  return v_inv.org_id;
end $$;
revoke execute on function public.accept_invite(uuid) from public, anon;
grant execute on function public.accept_invite(uuid) to authenticated;

-- Daftar anggota tim (email hanya untuk owner)
create or replace function public.team_members(p_org uuid)
returns table (user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.full_name, case when public.is_org_owner(p_org) then u.email end, m.role, m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id left join public.profiles p on p.id = m.user_id
  where m.org_id = p_org and public.is_org_member(p_org)
  order by m.created_at;
$$;
revoke execute on function public.team_members(uuid) from public, anon;
grant execute on function public.team_members(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Data keuangan hanya untuk owner/manager
-- ---------------------------------------------------------------------
drop policy if exists "transactions: anggota bisa baca" on public.transactions;
create policy "transactions: owner/manager bisa baca" on public.transactions for select to authenticated
  using (public.can_write_org(org_id));
drop policy if exists "reports: anggota bisa baca" on public.reports;
create policy "reports: owner/manager bisa baca" on public.reports for select to authenticated
  using (public.can_write_org(org_id));
drop policy if exists "approvals: anggota bisa baca" on public.approvals;
create policy "approvals: owner/manager bisa baca" on public.approvals for select to authenticated
  using (public.can_write_org(org_id));
drop policy if exists "budgets: anggota bisa baca" on public.budgets;
create policy "budgets: owner/manager bisa baca" on public.budgets for select to authenticated
  using (public.can_write_org(public.property_org(property_id)));
drop policy if exists "rate_change_log: anggota bisa baca" on public.rate_change_log;
create policy "rate_change_log: owner/manager bisa baca" on public.rate_change_log for select to authenticated
  using (public.can_write_org(public.property_org(property_id)));
drop policy if exists "receipts: anggota bisa lihat" on storage.objects;
create policy "receipts: owner/manager bisa lihat" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role in ('owner', 'manager') and m.org_id::text = (storage.foldername(name))[1]));

-- ---------------------------------------------------------------------
-- 5) WhatsApp: kirim ke nomor tertentu + jadwal tugas harian staf
-- ---------------------------------------------------------------------
create or replace function public.send_whatsapp_to(p_org uuid, p_to text[], p_text text, p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s        public.notification_settings;
  v_token  text;
  v_text   text;
  v_to     text;
  v_status int;
  v_resp   text;
  v_out    jsonb := '[]'::jsonb;
begin
  select * into s from public.notification_settings where org_id = p_org;
  if s.org_id is null or not s.wa_enabled then return jsonb_build_object('ok', false, 'error', 'WhatsApp belum diaktifkan'); end if;
  select d.decrypted_secret into v_token
  from public.notification_secrets ns join vault.decrypted_secrets d on d.id = ns.secret_id
  where ns.org_id = p_org;
  if s.wa_phone_number_id is null or v_token is null or cardinality(coalesce(p_to, s.wa_recipients)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Pengaturan WhatsApp belum lengkap (Phone number ID, token, penerima)');
  end if;

  -- Parameter template WhatsApp tidak boleh berisi baris baru / tab / >4 spasi beruntun
  v_text := left(regexp_replace(regexp_replace(p_text, '[\r\n\t]+', ' · ', 'g'), ' {2,}', ' ', 'g'), 900);
  if s.app_url is not null then v_text := v_text || ' · ' || s.app_url; end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  foreach v_to in array coalesce(p_to, s.wa_recipients) loop
    begin
      select status, content into v_status, v_resp from extensions.http((
        'POST',
        format('https://graph.facebook.com/%s/%s/messages', s.wa_api_version, s.wa_phone_number_id),
        array[extensions.http_header('Authorization', 'Bearer ' || v_token)],
        'application/json',
        jsonb_build_object(
          'messaging_product', 'whatsapp', 'to', v_to, 'type', 'template',
          'template', jsonb_build_object(
            'name', s.wa_template, 'language', jsonb_build_object('code', s.wa_language),
            'components', jsonb_build_array(jsonb_build_object('type', 'body',
              'parameters', jsonb_build_array(jsonb_build_object('type', 'text', 'text', v_text))))))::text
      )::extensions.http_request);
    exception when others then
      v_status := 0; v_resp := sqlerrm;
    end;
    insert into public.notification_log (org_id, recipient, kind, message, http_status, response)
    values (p_org, v_to, p_kind, v_text, v_status, left(v_resp, 1000));
    v_out := v_out || jsonb_build_object('to', v_to, 'status', v_status,
      'error', case when v_status between 200 and 299 then null
                    else coalesce(substring(v_resp from '"message"\s*:\s*"([^"]*)"'), left(v_resp, 200)) end);
  end loop;
  return jsonb_build_object('ok', not exists (select 1 from jsonb_array_elements(v_out) x where (x ->> 'status')::int not between 200 and 299),
                            'results', v_out);
end $$;

revoke execute on function public.send_whatsapp_to(uuid, text[], text, text) from public, anon, authenticated;

create or replace function public.send_whatsapp(p_org uuid, p_text text, p_kind text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.send_whatsapp_to(p_org, null, p_text, p_kind);
$$;
revoke execute on function public.send_whatsapp(uuid, text, text) from public, anon, authenticated;

create or replace function public.notify_staff_tasks(p_org uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_today date := public.local_today();
begin
  if not exists (select 1 from public.notification_settings where org_id = p_org and wa_enabled and notify_staff_tasks) then return 0; end if;
  for r in
    select s.name, public.normalize_phone(s.phone) as phone,
           string_agg(to_char(t.due_at at time zone 'Asia/Makassar', 'HH24:MI') || ' ' || p.name || ': ' || t.title,
                      '; ' order by t.due_at) as list, count(*) as n
    from public.staff s
    join public.tasks t on t.assigned_to = s.id and t.status in ('todo', 'in_progress')
    join public.properties p on p.id = t.property_id
    where s.org_id = p_org and s.active and length(public.normalize_phone(s.phone)) >= 10
      and (t.due_at at time zone 'Asia/Makassar')::date <= v_today
    group by s.id, s.name, s.phone
  loop
    perform public.send_whatsapp_to(p_org, array[r.phone],
      format('Halo %s, tugas hari ini (%s): %s', r.name, r.n, r.list), 'staff_tasks');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.notify_staff_tasks(uuid) from public, anon, authenticated;

-- Job harian: + tugas servis aset + jadwal staf
create or replace function public.run_scheduled(p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_today date := public.local_today(); v_n int := 0; v_ws date; v_ms date; v_rep uuid; v_alerts int;
begin
  if p_kind = 'ical' then
    perform public.sync_ical(null);
    return 'ical synced';
  elsif p_kind = 'daily' then
    perform public.sync_ical(null);
    perform public.compute_rate_recommendations(null);
    perform public.generate_ops_tasks(null);
    v_alerts := public.generate_alerts(null);
    for v_org in select org_id from public.notification_settings where wa_enabled loop
      perform public.notify_daily_alerts(v_org);
      perform public.notify_staff_tasks(v_org);
    end loop;
    return 'alerts: ' || v_alerts;
  elsif p_kind = 'weekly' then
    v_ws := v_today - (extract(isodow from v_today)::int - 1) - 7;
    for v_org in select id from public.organizations loop
      v_rep := public.generate_report(v_org, 'weekly', v_ws, v_ws + 7); v_n := v_n + 1;
      perform public.notify_report(v_rep);
    end loop;
    return 'weekly reports: ' || v_n;
  elsif p_kind = 'monthly' then
    v_ms := (date_trunc('month', v_today) - interval '1 month')::date;
    for v_org in select id from public.organizations loop
      v_rep := public.generate_report(v_org, 'monthly', v_ms, (v_ms + interval '1 month')::date); v_n := v_n + 1;
      perform public.notify_report(v_rep);
    end loop;
    return 'monthly reports: ' || v_n;
  end if;
  raise exception 'Jenis job tidak dikenal: %', p_kind;
end $$;
revoke execute on function public.run_scheduled(text) from public, anon, authenticated;

