-- =====================================================================
-- VILLA AI — Fase 3: Alert proaktif, laporan otomatis, job terjadwal
-- ---------------------------------------------------------------------
-- * generate_alerts()  : cek aturan bisnis → buat alert (tanpa duplikat)
-- * generate_report()  : hitung metrik laporan mingguan/bulanan → simpan
-- * run_scheduled()    : dipanggil pg_cron setiap hari/minggu/bulan
-- Semua angka dihitung SQL. AI hanya menjelaskan (dibuat di aplikasi).
-- =====================================================================

-- ---------- Alert: kunci anti-duplikat & waktu selesai ----------
alter table public.alerts add column if not exists dedup_key text;
alter table public.alerts add column if not exists resolved_at timestamptz;
create unique index if not exists alerts_org_dedup on public.alerts (org_id, dedup_key);

-- ---------- Laporan: satu laporan per organisasi per periode ----------
create unique index if not exists reports_org_period
  on public.reports (org_id, period_type, period_start) where property_id is null;

-- Tanggal "hari ini" menurut waktu Bali
create or replace function public.local_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Makassar')::date;
$$;

-- =====================================================================
-- 1) ATURAN ALERT
-- =====================================================================
create or replace function public.generate_alerts(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_orgs   uuid[];
  v_today  date := public.local_today();
  v_m1     date := (date_trunc('month', public.local_today()) - interval '1 month')::date; -- bulan penuh terakhir
  v_m0     date := (date_trunc('month', public.local_today()) - interval '2 months')::date;
  v_total  int := 0;
  v_n      int;
begin
  if p_org is null then
    if auth.uid() is not null then raise exception 'Sebutkan organisasi'; end if;  -- hanya job terjadwal
    select coalesce(array_agg(id), '{}') into v_orgs from public.organizations;
  else
    if auth.uid() is not null and not public.is_org_member(p_org) then
      raise exception 'Tidak punya akses ke organisasi ini';
    end if;
    v_orgs := array[p_org];
  end if;

  -- a) Okupansi 30 hari ke depan rendah (< 50%)
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select f.org_id, f.property_id, 'low_forward_occupancy',
         case when f.occupancy_pct < 30 then 'critical' else 'warning' end,
         format('Okupansi 30 hari ke depan %s hanya %s%%', f.property_name, f.occupancy_pct),
         jsonb_build_object('horizon_days', 30, 'occupancy_pct', f.occupancy_pct,
                            'booked_nights', f.booked_nights, 'threshold_pct', 50, 'as_of', v_today),
         format('low_occ30:%s:%s', f.property_id, to_char(v_today, 'IYYY-IW'))
  from public.v_forward_occupancy f
  where f.org_id = any(v_orgs) and f.horizon_days = 30 and f.occupancy_pct < 50
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- otomatis selesai jika okupansi sudah pulih
  update public.alerts a set status = 'resolved', resolved_at = now()
  where a.type = 'low_forward_occupancy' and a.status <> 'resolved' and a.org_id = any(v_orgs)
    and exists (select 1 from public.v_forward_occupancy f
                where f.property_id = a.property_id and f.horizon_days = 30 and f.occupancy_pct >= 50);

  -- b) Pengeluaran tidak wajar (>= 2x rata-rata 3 bulan & selisih >= Rp 1 jt)
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select p.org_id, e.property_id, 'expense_anomaly',
         case when e.ratio_vs_avg >= 4 then 'critical' else 'warning' end,
         format('Pengeluaran %s di %s %s× rata-rata (%s)', e.category_name, p.name,
                trim(to_char(e.ratio_vs_avg, 'FM990.0')), to_char(e.month, 'MM/YYYY')),
         jsonb_build_object('category', e.category_name, 'month', to_char(e.month, 'YYYY-MM'),
                            'amount', e.amount, 'avg_prev_3_months', e.avg_prev_3_months,
                            'ratio', e.ratio_vs_avg, 'excess', e.amount - e.avg_prev_3_months),
         format('exp:%s:%s:%s', e.property_id, e.category_id, to_char(e.month, 'YYYY-MM'))
  from public.v_expense_baseline e
  join public.properties p on p.id = e.property_id
  where p.org_id = any(v_orgs) and e.month >= v_m1
    and e.ratio_vs_avg >= 2 and e.amount - e.avg_prev_3_months >= 1000000
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- c) Okupansi bulan lalu turun >= 15 poin dibanding bulan sebelumnya
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select k1.org_id, k1.property_id, 'occupancy_drop', 'warning',
         format('Okupansi %s turun %s poin (%s%% → %s%%)', k1.property_name,
                round(k0.occupancy_pct - k1.occupancy_pct, 1), k0.occupancy_pct, k1.occupancy_pct),
         jsonb_build_object('month', to_char(v_m1, 'YYYY-MM'), 'occupancy_pct', k1.occupancy_pct,
                            'prev_month', to_char(v_m0, 'YYYY-MM'), 'prev_occupancy_pct', k0.occupancy_pct,
                            'adr', k1.adr, 'prev_adr', k0.adr),
         format('occdrop:%s:%s', k1.property_id, to_char(v_m1, 'YYYY-MM'))
  from public.v_monthly_kpi k1
  join public.v_monthly_kpi k0 on k0.property_id = k1.property_id and k0.month = v_m0
  where k1.org_id = any(v_orgs) and k1.month = v_m1
    and k0.occupancy_pct - k1.occupancy_pct >= 15
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- d) Villa rugi di bulan penuh terakhir
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select k.org_id, k.property_id, 'monthly_loss', 'critical',
         format('%s rugi di %s', k.property_name, to_char(v_m1, 'MM/YYYY')),
         jsonb_build_object('month', to_char(v_m1, 'YYYY-MM'), 'net_profit', k.net_profit,
                            'room_revenue', k.room_revenue, 'expenses', k.expenses, 'commission', k.commission),
         format('loss:%s:%s', k.property_id, to_char(v_m1, 'YYYY-MM'))
  from public.v_monthly_kpi k
  where k.org_id = any(v_orgs) and k.month = v_m1 and k.net_profit < 0
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- e) Celah 1–2 malam di antara booking (45 hari ke depan) — sulit terjual tanpa aksi
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select p.org_id, g.property_id, 'booking_gap', 'info',
         format('Celah %s malam di %s (%s–%s)', g.next_in - g.check_out, p.name,
                to_char(g.check_out, 'DD/MM'), to_char(g.next_in, 'DD/MM')),
         jsonb_build_object('gap_start', g.check_out, 'gap_end', g.next_in, 'nights', g.next_in - g.check_out),
         format('gap:%s:%s', g.property_id, g.check_out)
  from (
    select property_id, check_out,
           lead(check_in) over (partition by property_id order by check_in) as next_in
    from public.bookings
    where status in ('confirmed', 'checked_in', 'completed')
      and check_out >= v_today - 30 and check_in < v_today + 60
  ) g
  join public.properties p on p.id = g.property_id
  where p.org_id = any(v_orgs) and p.status = 'active'
    and g.check_out >= v_today and g.check_out < v_today + 45
    and g.next_in - g.check_out between 1 and 2
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- f) Jadwal servis aset jatuh tempo dalam 7 hari
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select p.org_id, a.property_id, 'asset_service_due', 'info',
         format('Servis %s di %s jatuh tempo %s', a.name, p.name,
                to_char(a.last_service_at + a.service_interval_days, 'DD/MM/YYYY')),
         jsonb_build_object('asset', a.name, 'due_date', a.last_service_at + a.service_interval_days,
                            'last_service_at', a.last_service_at),
         format('asset:%s:%s', a.id, a.last_service_at + a.service_interval_days)
  from public.assets a
  join public.properties p on p.id = a.property_id
  where p.org_id = any(v_orgs) and a.last_service_at is not null and a.service_interval_days is not null
    and a.last_service_at + a.service_interval_days <= v_today + 7
  on conflict (org_id, dedup_key) do nothing;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  -- alert berbasis tanggal yang sudah lewat → selesai otomatis
  update public.alerts set status = 'resolved', resolved_at = now()
  where org_id = any(v_orgs) and status <> 'resolved'
    and type = 'booking_gap' and (data ->> 'gap_end')::date <= v_today;

  return v_total;
end $$;

revoke execute on function public.generate_alerts(uuid) from public, anon;
grant execute on function public.generate_alerts(uuid) to authenticated;

-- =====================================================================
-- 2) METRIK LAPORAN
-- =====================================================================
-- Metrik untuk satu periode [p_start, p_end) — per villa + total
create or replace function public.period_metrics(p_org uuid, p_start date, p_end date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with props as (
    select id, name, greatest(p_start, coalesce(opening_date, p_start)) as avail_from
    from public.properties where org_id = p_org and status = 'active'
  ),
  nights as (
    select bn.property_id, count(*) as occ, sum(bn.gross_per_night) as rev, sum(bn.commission_per_night) as com
    from public.v_booking_nights bn join props on props.id = bn.property_id
    where bn.night >= p_start and bn.night < p_end group by 1
  ),
  tx as (
    select property_id,
           sum(amount) filter (where type = 'income') as inc,
           sum(amount) filter (where type = 'expense') as exp
    from public.transactions
    where org_id = p_org and date >= p_start and date < p_end group by 1
  ),
  per as (
    select pr.name as property, pr.id as property_id,
           greatest(0, p_end - pr.avail_from) as available_nights,
           coalesce(n.occ, 0) as occupied_nights,
           round(coalesce(n.rev, 0)) as room_revenue,
           round(coalesce(n.com, 0)) as commission,
           coalesce(t.inc, 0) as other_income,
           coalesce(t.exp, 0) as expenses
    from props pr left join nights n on n.property_id = pr.id left join tx t on t.property_id = pr.id
  ),
  per2 as (
    select *, round(100.0 * occupied_nights / nullif(available_nights, 0), 1) as occupancy_pct,
           round(room_revenue / nullif(occupied_nights, 0)) as adr,
           round(room_revenue / nullif(available_nights, 0)) as revpar,
           room_revenue + other_income - commission - expenses as net_profit
    from per
  ),
  shared as (select coalesce((select exp from tx where property_id is null), 0) as shared_expenses)
  select jsonb_build_object(
    'start', p_start, 'end', p_end,
    'properties', coalesce((select jsonb_agg(to_jsonb(per2) order by property) from per2), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'available_nights', sum(available_nights), 'occupied_nights', sum(occupied_nights),
        'occupancy_pct', round(100.0 * sum(occupied_nights) / nullif(sum(available_nights), 0), 1),
        'room_revenue', sum(room_revenue), 'commission', sum(commission),
        'other_income', sum(other_income), 'expenses', sum(expenses),
        'adr', round(sum(room_revenue) / nullif(sum(occupied_nights), 0)),
        'revpar', round(sum(room_revenue) / nullif(sum(available_nights), 0)),
        'shared_expenses', (select shared_expenses from shared),
        'net_profit', sum(net_profit) - (select shared_expenses from shared))
      from per2)
  );
$$;
revoke execute on function public.period_metrics(uuid, date, date) from public, anon, authenticated;

create or replace function public.generate_report(p_org uuid, p_period_type text, p_start date, p_end date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_len   int := p_end - p_start;
  v_id    uuid;
  v_metrics jsonb;
begin
  if auth.uid() is not null and not public.is_org_member(p_org) then
    raise exception 'Tidak punya akses ke organisasi ini';
  end if;
  if p_end <= p_start or v_len > 400 then raise exception 'Periode tidak valid'; end if;
  if p_period_type not in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom') then
    raise exception 'Jenis laporan tidak valid';
  end if;

  v_metrics := jsonb_build_object(
    'current', public.period_metrics(p_org, p_start, p_end),
    'previous', public.period_metrics(p_org, p_start - v_len, p_start),
    'channels', coalesce((
      select jsonb_agg(c order by c.gross desc) from (
        select coalesce(ch.name, 'Tidak diketahui') as channel, count(*) as nights,
               count(distinct bn.booking_id) as bookings,
               round(sum(bn.gross_per_night)) as gross, round(sum(bn.commission_per_night)) as commission
        from public.v_booking_nights bn
        join public.properties p on p.id = bn.property_id and p.org_id = p_org
        left join public.channels ch on ch.id = bn.channel_id
        where bn.night >= p_start and bn.night < p_end
        group by 1) c), '[]'::jsonb),
    'top_expenses', coalesce((
      select jsonb_agg(e order by e.amount desc) from (
        select cat.name as category, sum(t.amount) as amount
        from public.transactions t join public.categories cat on cat.id = t.category_id
        where t.org_id = p_org and t.type = 'expense' and t.date >= p_start and t.date < p_end
        group by 1 order by 2 desc limit 8) e), '[]'::jsonb),
    'forward_occupancy', coalesce((
      select jsonb_agg(jsonb_build_object('property', property_name, 'horizon_days', horizon_days,
                                          'occupancy_pct', occupancy_pct) order by property_name, horizon_days)
      from public.v_forward_occupancy where org_id = p_org), '[]'::jsonb),
    'open_alerts', (select count(*) from public.alerts where org_id = p_org and status = 'open'),
    'generated_on', public.local_today()
  );

  insert into public.reports (org_id, property_id, period_type, period_start, period_end, metrics)
  values (p_org, null, p_period_type, p_start, p_end - 1, v_metrics)
  on conflict (org_id, period_type, period_start) where property_id is null
  do update set metrics = excluded.metrics, period_end = excluded.period_end,
                ai_summary = null, created_at = now()
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.generate_report(uuid, text, date, date) from public, anon;
grant execute on function public.generate_report(uuid, text, date, date) to authenticated;

-- =====================================================================
-- 3) JOB TERJADWAL (pg_cron, zona waktu UTC)
--    harian  00:05 UTC = 08:05 WITA  → cek alert semua bisnis
--    mingguan Senin 00:15 UTC         → laporan minggu lalu (Senin–Minggu)
--    bulanan tgl 1 00:25 UTC          → laporan bulan lalu
-- =====================================================================
create or replace function public.run_scheduled(p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_today date := public.local_today(); v_n int := 0; v_ws date; v_ms date;
begin
  if p_kind = 'daily' then
    return 'alerts: ' || public.generate_alerts(null);
  elsif p_kind = 'weekly' then
    v_ws := v_today - (extract(isodow from v_today)::int - 1) - 7;  -- Senin minggu lalu
    for v_org in select id from public.organizations loop
      perform public.generate_report(v_org, 'weekly', v_ws, v_ws + 7); v_n := v_n + 1;
    end loop;
    return 'weekly reports: ' || v_n;
  elsif p_kind = 'monthly' then
    v_ms := (date_trunc('month', v_today) - interval '1 month')::date;
    for v_org in select id from public.organizations loop
      perform public.generate_report(v_org, 'monthly', v_ms, (v_ms + interval '1 month')::date); v_n := v_n + 1;
    end loop;
    return 'monthly reports: ' || v_n;
  end if;
  raise exception 'Jenis job tidak dikenal: %', p_kind;
end $$;
revoke execute on function public.run_scheduled(text) from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.schedule('villa-daily-alerts',    '5 0 * * *',  $$select public.run_scheduled('daily')$$);
select cron.schedule('villa-weekly-report',   '15 0 * * 1', $$select public.run_scheduled('weekly')$$);
select cron.schedule('villa-monthly-report',  '25 0 1 * *', $$select public.run_scheduled('monthly')$$);
