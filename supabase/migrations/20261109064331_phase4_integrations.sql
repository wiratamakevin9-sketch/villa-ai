-- =====================================================================
-- VILLA AI — Fase 4: Integrasi
--   A. Sinkron kalender OTA (iCal) — setiap jam
--   B. Notifikasi WhatsApp (Meta Cloud API) — token di Supabase Vault
--   C. Feed data untuk Google Sheets (=IMPORTDATA) dengan token rahasia
-- =====================================================================

create extension if not exists http with schema extensions;

-- =====================================================================
-- A. iCal
-- =====================================================================
create table public.ical_feeds (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references public.properties(id) on delete cascade,
  channel_name    text not null,                 -- 'Airbnb', 'Booking.com', 'Agoda', ...
  url             text not null check (url ~ '^https://'),
  last_synced_at  timestamptz,
  last_status     text,                          -- 'ok' / 'error'
  last_error      text,
  event_count     int,
  created_at      timestamptz not null default now(),
  unique (property_id, url)
);

create table public.ical_events (
  id             uuid primary key default gen_random_uuid(),
  feed_id        uuid not null references public.ical_feeds(id) on delete cascade,
  property_id    uuid not null references public.properties(id) on delete cascade,
  channel_name   text not null,
  uid            text not null,
  summary        text,
  start_date     date not null,
  end_date       date not null,
  is_block       boolean not null default false,   -- tanggal diblokir manual, bukan tamu
  booking_id     uuid references public.bookings(id) on delete set null,
  status         text not null default 'active' check (status in ('active', 'removed', 'ignored')),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  unique (feed_id, uid)
);
create index on public.ical_events (property_id, start_date);

alter table public.ical_feeds enable row level security;
alter table public.ical_events enable row level security;

-- URL iCal bersifat rahasia → hanya owner/manager
create policy "ical_feeds: owner/manager" on public.ical_feeds for all to authenticated
  using (public.can_write_org(public.property_org(property_id)))
  with check (public.can_write_org(public.property_org(property_id)));
create policy "ical_events: anggota bisa baca" on public.ical_events for select to authenticated
  using (public.is_org_member(public.property_org(property_id)));
create policy "ical_events: owner/manager bisa ubah" on public.ical_events for update to authenticated
  using (public.can_write_org(public.property_org(property_id)))
  with check (public.can_write_org(public.property_org(property_id)));

-- Parser iCal sederhana: ambil UID, SUMMARY, DTSTART, DTEND (format tanggal YYYYMMDD)
create or replace function public.parse_ics(p_text text)
returns table (uid text, summary text, start_date date, end_date date)
language sql immutable set search_path = '' as $$
  with unfolded as (
    -- normalisasi baris & gabungkan baris lanjutan (diawali spasi/tab)
    select regexp_replace(replace(replace(p_text, chr(13) || chr(10), chr(10)), chr(13), chr(10)),
                          '\n[ \t]', '', 'g') as t
  ),
  ev as (
    select (regexp_matches(t, 'BEGIN:VEVENT(.*?)END:VEVENT', 'g'))[1] as body from unfolded
  ),
  f as (
    select trim((regexp_match(body, '\nUID[^:\n]*:([^\n]*)'))[1]) as uid,
           trim((regexp_match(body, '\nSUMMARY[^:\n]*:([^\n]*)'))[1]) as summary,
           to_date((regexp_match(body, '\nDTSTART[^:\n]*:(\d{8})'))[1], 'YYYYMMDD') as s,
           to_date((regexp_match(body, '\nDTEND[^:\n]*:(\d{8})'))[1], 'YYYYMMDD') as e
    from ev
  )
  select coalesce(uid, md5(coalesce(summary, '') || s::text)), summary, s, greatest(coalesce(e, s + 1), s + 1)
  from f where s is not null;
$$;

create or replace function public.sync_ical_feed(p_feed uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_feed   public.ical_feeds;
  v_today  date := public.local_today();
  v_status int;
  v_body   text;
  v_n      int := 0;
  v_removed int := 0;
begin
  select * into v_feed from public.ical_feeds where id = p_feed;
  if v_feed.id is null then raise exception 'Feed tidak ditemukan'; end if;

  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');
    select status, content into v_status, v_body from extensions.http_get(v_feed.url);
  exception when others then
    update public.ical_feeds set last_synced_at = now(), last_status = 'error', last_error = left(sqlerrm, 300) where id = p_feed;
    return jsonb_build_object('feed', p_feed, 'ok', false, 'error', sqlerrm);
  end;

  if v_status <> 200 or v_body is null or position('BEGIN:VCALENDAR' in v_body) = 0 then
    update public.ical_feeds set last_synced_at = now(), last_status = 'error',
      last_error = format('HTTP %s: bukan file kalender iCal', v_status) where id = p_feed;
    return jsonb_build_object('feed', p_feed, 'ok', false, 'error', format('HTTP %s', v_status));
  end if;

  -- simpan/perbarui event (abaikan yang sudah lewat > 30 hari)
  insert into public.ical_events (feed_id, property_id, channel_name, uid, summary, start_date, end_date, is_block)
  select v_feed.id, v_feed.property_id, v_feed.channel_name, e.uid, e.summary, e.start_date, e.end_date,
         coalesce(e.summary ~* '(not available|unavailable|closed|blocked|tidak tersedia)', false)
  from public.parse_ics(v_body) e
  where e.end_date >= v_today - 30
  on conflict (feed_id, uid) do update
    set summary = excluded.summary, start_date = excluded.start_date, end_date = excluded.end_date,
        is_block = excluded.is_block, last_seen_at = now(),
        status = case when public.ical_events.status = 'removed' then 'active' else public.ical_events.status end;
  get diagnostics v_n = row_count;

  -- event masa depan yang tidak muncul lagi → kemungkinan dibatalkan
  update public.ical_events set status = 'removed'
  where feed_id = v_feed.id and status = 'active' and start_date >= v_today and last_seen_at < now();
  get diagnostics v_removed = row_count;

  -- cocokkan dengan booking yang sudah dicatat (villa sama, tanggal sama)
  update public.ical_events ie set booking_id = b.id
  from public.bookings b
  where ie.feed_id = v_feed.id and ie.booking_id is null and not ie.is_block
    and b.property_id = ie.property_id and b.check_in = ie.start_date and b.check_out = ie.end_date
    and b.status <> 'cancelled';

  update public.ical_feeds set last_synced_at = now(), last_status = 'ok', last_error = null,
    event_count = (select count(*) from public.ical_events where feed_id = v_feed.id and status = 'active')
  where id = p_feed;

  return jsonb_build_object('feed', p_feed, 'ok', true, 'events', v_n, 'removed', v_removed);
end $$;
revoke execute on function public.sync_ical_feed(uuid) from public, anon, authenticated;

create or replace function public.sync_ical(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_orgs uuid[]; v_feed uuid; v_results jsonb := '[]'::jsonb; v_today date := public.local_today();
begin
  if p_org is null then
    if auth.uid() is not null then raise exception 'Sebutkan organisasi'; end if;
    select coalesce(array_agg(id), '{}') into v_orgs from public.organizations;
  else
    if auth.uid() is not null and not public.can_write_org(p_org) then raise exception 'Tidak punya akses'; end if;
    v_orgs := array[p_org];
  end if;

  for v_feed in
    select f.id from public.ical_feeds f join public.properties p on p.id = f.property_id
    where p.org_id = any(v_orgs) and p.status = 'active'
  loop
    v_results := v_results || public.sync_ical_feed(v_feed);
  end loop;

  -- Alert: booking di kalender OTA yang belum dicatat (30 hari ke depan)
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select p.org_id, e.property_id, 'ical_unrecorded',
         case when e.start_date <= v_today + 7 then 'warning' else 'info' end,
         format('Booking %s %s–%s di %s belum dicatat', e.channel_name,
                to_char(e.start_date, 'DD/MM'), to_char(e.end_date, 'DD/MM'), p.name),
         jsonb_build_object('event_id', e.id, 'channel', e.channel_name, 'start_date', e.start_date, 'end_date', e.end_date),
         format('ical:%s', e.id)
  from public.ical_events e join public.properties p on p.id = e.property_id
  where p.org_id = any(v_orgs) and e.status = 'active' and not e.is_block and e.booking_id is null
    and e.start_date >= v_today and e.start_date < v_today + 30
  on conflict (org_id, dedup_key) do nothing;

  -- Alert: booking tercatat tapi hilang dari kalender OTA → kemungkinan dibatalkan
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select p.org_id, e.property_id, 'ical_cancelled', 'warning',
         format('Booking %s %s–%s di %s hilang dari kalender %s — mungkin dibatalkan',
                coalesce(g.name, 'tamu'), to_char(e.start_date, 'DD/MM'), to_char(e.end_date, 'DD/MM'), p.name, e.channel_name),
         jsonb_build_object('event_id', e.id, 'booking_id', b.id, 'channel', e.channel_name),
         format('icalcancel:%s', e.id)
  from public.ical_events e
  join public.properties p on p.id = e.property_id
  join public.bookings b on b.id = e.booking_id and b.status in ('confirmed', 'checked_in')
  left join public.guests g on g.id = b.guest_id
  where p.org_id = any(v_orgs) and e.status = 'removed'
  on conflict (org_id, dedup_key) do nothing;

  -- alert "belum dicatat" selesai otomatis jika sudah dicatat/diabaikan/lewat
  update public.alerts a set status = 'resolved', resolved_at = now()
  from public.ical_events e
  where a.type = 'ical_unrecorded' and a.status <> 'resolved' and a.org_id = any(v_orgs)
    and e.id = (a.data ->> 'event_id')::uuid
    and (e.booking_id is not null or e.status <> 'active' or e.start_date < v_today);

  return v_results;
end $$;
revoke execute on function public.sync_ical(uuid) from public, anon;
grant execute on function public.sync_ical(uuid) to authenticated;

-- =====================================================================
-- B. WhatsApp
-- =====================================================================
create table public.notification_settings (
  org_id               uuid primary key references public.organizations(id) on delete cascade,
  wa_enabled           boolean not null default false,
  wa_phone_number_id   text,
  wa_api_version       text not null default 'v23.0',
  wa_template          text not null default 'villa_ai_notifikasi',
  wa_language          text not null default 'id',
  wa_recipients        text[] not null default '{}',     -- nomor format internasional tanpa +, mis. 6281234567890
  notify_daily_alerts  boolean not null default true,
  notify_reports       boolean not null default true,
  app_url              text,
  updated_at           timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy "notification_settings: owner" on public.notification_settings for all to authenticated
  using (public.is_org_owner(org_id)) with check (public.is_org_owner(org_id));

-- Referensi token di Vault: tabel terpisah TANPA policy → tidak bisa diakses lewat API sama sekali,
-- hanya oleh fungsi security definer di bawah.
create table public.notification_secrets (
  org_id     uuid primary key references public.organizations(id) on delete cascade,
  secret_id  uuid not null
);
alter table public.notification_secrets enable row level security;

create table public.notification_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  channel     text not null default 'whatsapp',
  recipient   text,
  kind        text,               -- 'test', 'daily_alerts', 'report'
  message     text,
  http_status int,
  response    text,
  sent_at     timestamptz not null default now()
);
create index on public.notification_log (org_id, sent_at desc);
alter table public.notification_log enable row level security;
create policy "notification_log: owner bisa baca" on public.notification_log for select to authenticated
  using (public.is_org_owner(org_id));

-- Status token (ada/tidak) untuk ditampilkan di Pengaturan, tanpa membuka isinya
create or replace function public.whatsapp_token_set(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_org_owner(p_org) and exists (select 1 from public.notification_secrets where org_id = p_org);
$$;
revoke execute on function public.whatsapp_token_set(uuid) from public, anon;
grant execute on function public.whatsapp_token_set(uuid) to authenticated;

-- Simpan / ganti token WhatsApp di Vault (hanya owner)
create or replace function public.set_whatsapp_token(p_org uuid, p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_org_owner(p_org) then raise exception 'Hanya owner'; end if;
  if coalesce(length(trim(p_token)), 0) < 20 then raise exception 'Token tidak valid'; end if;
  insert into public.notification_settings (org_id) values (p_org) on conflict (org_id) do nothing;
  select secret_id into v_id from public.notification_secrets where org_id = p_org;
  if v_id is null then
    v_id := vault.create_secret(trim(p_token), 'whatsapp_token_' || p_org::text, 'Token WhatsApp Cloud API Villa AI');
    insert into public.notification_secrets (org_id, secret_id) values (p_org, v_id);
  else
    perform vault.update_secret(v_id, trim(p_token));
  end if;
end $$;
revoke execute on function public.set_whatsapp_token(uuid, text) from public, anon;
grant execute on function public.set_whatsapp_token(uuid, text) to authenticated;

-- Kirim pesan template WhatsApp ke semua penerima organisasi
create or replace function public.send_whatsapp(p_org uuid, p_text text, p_kind text)
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
  if s.wa_phone_number_id is null or v_token is null or cardinality(s.wa_recipients) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Pengaturan WhatsApp belum lengkap (Phone number ID, token, penerima)');
  end if;

  -- Parameter template WhatsApp tidak boleh berisi baris baru / tab / >4 spasi beruntun
  v_text := left(regexp_replace(regexp_replace(p_text, '[\r\n\t]+', ' · ', 'g'), ' {2,}', ' ', 'g'), 900);
  if s.app_url is not null then v_text := v_text || ' · ' || s.app_url; end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '15');
  foreach v_to in array s.wa_recipients loop
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
revoke execute on function public.send_whatsapp(uuid, text, text) from public, anon, authenticated;

create or replace function public.send_whatsapp_test(p_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_owner(p_org) then raise exception 'Hanya owner'; end if;
  return public.send_whatsapp(p_org, 'Tes notifikasi Villa AI berhasil. Alert harian dan laporan akan dikirim ke nomor ini.', 'test');
end $$;
revoke execute on function public.send_whatsapp_test(uuid) from public, anon;
grant execute on function public.send_whatsapp_test(uuid) to authenticated;

-- Format Rupiah singkat: 137000000 → 'Rp 137 jt'
create or replace function public.rp_short(n numeric)
returns text language sql immutable set search_path = '' as $$
  select case when abs(coalesce(n, 0)) >= 1000000000 then 'Rp ' || replace(round(n / 1e9, 1)::text, '.', ',') || ' M'
              else 'Rp ' || replace(round(coalesce(n, 0) / 1e6, 1)::text, '.', ',') || ' jt' end;
$$;

-- Ringkasan alert baru hari ini (penting saja) → WhatsApp
create or replace function public.notify_daily_alerts(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_text text; v_n int;
begin
  if not exists (select 1 from public.notification_settings where org_id = p_org and wa_enabled and notify_daily_alerts) then return; end if;
  select count(*), string_agg(case severity when 'critical' then '⛔ ' else '⚠️ ' end || title, '; ' order by severity, created_at)
    into v_n, v_text
  from (select severity, title, created_at from public.alerts
        where org_id = p_org and status = 'open' and severity in ('critical', 'warning')
          and created_at >= now() - interval '24 hours'
        order by severity, created_at limit 5) a;
  if v_n > 0 then
    perform public.send_whatsapp(p_org, format('%s alert baru: %s', v_n, v_text), 'daily_alerts');
  end if;
end $$;
revoke execute on function public.notify_daily_alerts(uuid) from public, anon, authenticated;

create or replace function public.notify_report(p_report uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports; c jsonb; p jsonb; v_text text;
begin
  select * into r from public.reports where id = p_report;
  if not exists (select 1 from public.notification_settings where org_id = r.org_id and wa_enabled and notify_reports) then return; end if;
  c := r.metrics -> 'current' -> 'totals'; p := r.metrics -> 'previous' -> 'totals';
  v_text := format('Laporan %s %s–%s siap. Okupansi %s%% (sebelumnya %s%%), pendapatan kamar %s, laba bersih %s (sebelumnya %s).',
    case r.period_type when 'weekly' then 'mingguan' else 'bulanan' end,
    to_char(r.period_start, 'DD/MM'), to_char(r.period_end, 'DD/MM/YYYY'),
    coalesce(c ->> 'occupancy_pct', '-'), coalesce(p ->> 'occupancy_pct', '-'),
    public.rp_short((c ->> 'room_revenue')::numeric), public.rp_short((c ->> 'net_profit')::numeric),
    public.rp_short((p ->> 'net_profit')::numeric));
  perform public.send_whatsapp(r.org_id, v_text, 'report');
end $$;
revoke execute on function public.notify_report(uuid) from public, anon, authenticated;

-- =====================================================================
-- C. Feed data untuk Google Sheets (=IMPORTDATA) — token rahasia per organisasi
-- =====================================================================
create table public.export_tokens (
  org_id      uuid primary key references public.organizations(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.export_tokens enable row level security;
create policy "export_tokens: owner bisa lihat" on public.export_tokens for select to authenticated
  using (public.is_org_owner(org_id));

-- Buat token baru (token lama otomatis tidak berlaku). Token hanya ditampilkan sekali.
create or replace function public.rotate_export_token(p_org uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_org_owner(p_org) then raise exception 'Hanya owner'; end if;
  insert into public.export_tokens (org_id, token_hash) values (p_org, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  on conflict (org_id) do update set token_hash = excluded.token_hash, created_at = now();
  return v_token;
end $$;
revoke execute on function public.rotate_export_token(uuid) from public, anon;
grant execute on function public.rotate_export_token(uuid) to authenticated;

create or replace function public.revoke_export_token(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_owner(p_org) then raise exception 'Hanya owner'; end if;
  delete from public.export_tokens where org_id = p_org;
end $$;
revoke execute on function public.revoke_export_token(uuid) from public, anon;
grant execute on function public.revoke_export_token(uuid) to authenticated;

-- Dipanggil tanpa login (oleh Google Sheets). Hanya mengembalikan data jika token cocok.
create or replace function public.export_feed(p_token text, p_kind text)
returns setof jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid;
begin
  select org_id into v_org from public.export_tokens
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_org is null then raise exception 'Token tidak valid'; end if;

  if p_kind = 'kpi' then
    return query
      select jsonb_build_object('bulan', to_char(k.month, 'YYYY-MM'), 'villa', k.property_name,
        'malam_tersedia', k.available_nights, 'malam_terisi', k.occupied_nights, 'okupansi_pct', k.occupancy_pct,
        'adr', k.adr, 'revpar', k.revpar, 'pendapatan_kamar', k.room_revenue, 'komisi', k.commission,
        'pendapatan_lain', k.other_income, 'pengeluaran', k.expenses, 'laba_bersih', k.net_profit)
      from public.v_monthly_kpi k
      where k.org_id = v_org and k.month >= (date_trunc('month', public.local_today()) - interval '24 months')
        and k.month <= date_trunc('month', public.local_today())
      order by k.month, k.property_name;
  elsif p_kind = 'bookings' then
    return query
      select jsonb_build_object('villa', p.name, 'tamu', g.name, 'negara', g.country, 'channel', c.name,
        'check_in', b.check_in, 'check_out', b.check_out, 'malam', b.nights, 'jumlah_tamu', b.guests_count,
        'harga_kotor', b.gross_amount, 'komisi', b.commission_amount, 'bersih', b.net_amount,
        'status', b.status, 'kode_ota', b.external_ref, 'dipesan', b.booked_at::date)
      from public.bookings b join public.properties p on p.id = b.property_id
      left join public.guests g on g.id = b.guest_id left join public.channels c on c.id = b.channel_id
      where p.org_id = v_org and b.check_in >= public.local_today() - 730
      order by b.check_in;
  elsif p_kind = 'transactions' then
    return query
      select jsonb_build_object('tanggal', t.date, 'jenis', t.type, 'kategori', cat.name,
        'villa', coalesce(p.name, 'Bersama'), 'jumlah', t.amount, 'keterangan', t.description, 'metode', t.payment_method)
      from public.transactions t join public.categories cat on cat.id = t.category_id
      left join public.properties p on p.id = t.property_id
      where t.org_id = v_org and t.date >= public.local_today() - 730
      order by t.date;
  else
    raise exception 'Jenis data tidak dikenal';
  end if;
end $$;
revoke execute on function public.export_feed(text, text) from public;
grant execute on function public.export_feed(text, text) to anon, authenticated;

-- =====================================================================
-- Job terjadwal: tambah sinkron iCal (setiap jam) + kirim WhatsApp
-- =====================================================================
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
    v_alerts := public.generate_alerts(null);
    for v_org in select org_id from public.notification_settings where wa_enabled loop
      perform public.notify_daily_alerts(v_org);
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

select cron.schedule('villa-ical-sync', '17 * * * *', $$select public.run_scheduled('ical')$$);
