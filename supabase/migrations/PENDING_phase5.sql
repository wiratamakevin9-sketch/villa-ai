-- =====================================================================
-- VILLA AI — Fase 5: Revenue & Market Intelligence
--   * Batas harga per villa (min/maks)
--   * Rekomendasi harga per tanggal (90 hari ke depan), faktor bisa dijelaskan
--   * Alert peluang harga
-- Harga efektif per tanggal = harga khusus (rate_calendar) jika ada,
--                             selain itu harga dasar × pengali musim.
-- =====================================================================

alter table public.properties add column if not exists min_rate numeric(14,2) check (min_rate >= 0);
alter table public.properties add column if not exists max_rate numeric(14,2) check (max_rate >= 0);

create index if not exists competitor_rates_date on public.competitor_rates (date);
alter table public.competitors add column if not exists source text default 'manual';  -- 'manual' / 'ai_research'

create table public.rate_recommendations (
  property_id       uuid not null references public.properties(id) on delete cascade,
  date              date not null,
  current_rate      numeric(14,2) not null,
  recommended_rate  numeric(14,2) not null,
  change_pct        numeric(7,1) generated always as
                      (round(100 * (recommended_rate - current_rate) / nullif(current_rate, 0), 1)) stored,
  factors           jsonb not null,
  computed_at       timestamptz not null default now(),
  primary key (property_id, date)
);
alter table public.rate_recommendations enable row level security;
create policy "rate_recommendations: anggota bisa baca" on public.rate_recommendations for select to authenticated
  using (public.is_org_member(public.property_org(property_id)));

-- Harga efektif + status untuk rentang tanggal (dipakai kalender & AI)
create or replace function public.rate_calendar_view(p_property uuid, p_from date, p_to date)
returns table (date date, base_rate numeric, season_name text, season_multiplier numeric, override_rate numeric,
               effective_rate numeric, min_stay int, is_blocked boolean, is_booked boolean,
               recommended_rate numeric, change_pct numeric, factors jsonb)
language sql stable security invoker set search_path = '' as $$
  select d::date,
         p.base_rate,
         s.name,
         coalesce(s.rate_multiplier, 1),
         rc.rate,
         coalesce(rc.rate, round(p.base_rate * coalesce(s.rate_multiplier, 1), -4)),
         coalesce(rc.min_stay, 1),
         coalesce(rc.is_blocked, false),
         exists (select 1 from public.v_booking_nights bn where bn.property_id = p.id and bn.night = d::date),
         rr.recommended_rate, rr.change_pct, rr.factors
  from public.properties p
  cross join generate_series(p_from, p_to, interval '1 day') d
  left join lateral (
    select name, rate_multiplier from public.seasons
    where property_id = p.id and d::date between start_date and end_date
    order by rate_multiplier desc limit 1) s on true
  left join public.rate_calendar rc on rc.property_id = p.id and rc.date = d::date
  left join public.rate_recommendations rr on rr.property_id = p.id and rr.date = d::date
  where p.id = p_property and p_to - p_from <= 400;
$$;
grant execute on function public.rate_calendar_view(uuid, date, date) to authenticated;

-- =====================================================================
-- Mesin rekomendasi harga
-- =====================================================================
create or replace function public.compute_rate_recommendations(p_org uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_orgs  uuid[];
  v_today date := public.local_today();
  v_n     int;
begin
  if p_org is null then
    if auth.uid() is not null then raise exception 'Sebutkan organisasi'; end if;
    select coalesce(array_agg(id), '{}') into v_orgs from public.organizations;
  else
    if auth.uid() is not null and not public.is_org_member(p_org) then raise exception 'Tidak punya akses'; end if;
    v_orgs := array[p_org];
  end if;

  delete from public.rate_recommendations rr
  using public.properties p where p.id = rr.property_id and p.org_id = any(v_orgs);

  insert into public.rate_recommendations (property_id, date, current_rate, recommended_rate, factors)
  with props as (
    select p.id, p.org_id, p.bedrooms, p.base_rate,
           coalesce(p.min_rate, p.base_rate * 0.6) as floor_rate,
           coalesce(p.max_rate, p.base_rate * 2.0) as ceil_rate,
           -- okupansi 90 hari terakhir (sejak villa buka)
           (select round(100.0 * count(*) / greatest(1, v_today - greatest(v_today - 90, coalesce(p.opening_date, v_today - 90))), 1)
              from public.v_booking_nights bn
             where bn.property_id = p.id and bn.night >= v_today - 90 and bn.night < v_today) as hist_occ,
           (select occupancy_pct from public.v_forward_occupancy f where f.property_id = p.id and f.horizon_days = 30) as fwd30
    from public.properties p
    where p.org_id = any(v_orgs) and p.status = 'active' and coalesce(p.base_rate, 0) > 0
  ),
  booked as (
    select bn.property_id, bn.night from public.v_booking_nights bn join props on props.id = bn.property_id
    where bn.night between v_today - 3 and v_today + 96
  ),
  days as (
    select pr.*, d::date as date, (d::date - v_today) as lead_days,
           coalesce(s.rate_multiplier, 1) as season_mult, s.name as season_name, s.type as season_type,
           rc.rate as override_rate,
           (select count(*) from booked b where b.property_id = pr.id
              and b.night between d::date - 3 and d::date + 3 and b.night <> d::date)::numeric / 6 as nearby_occ,
           (select (percentile_cont(0.5) within group (order by cr.rate))::numeric
              from public.competitor_rates cr join public.competitors c on c.id = cr.competitor_id
             where c.org_id = pr.org_id and cr.date = d::date and cr.captured_at > now() - interval '45 days'
               and (c.bedrooms is null or pr.bedrooms is null or c.bedrooms = pr.bedrooms)) as comp_median
    from props pr
    cross join generate_series(v_today, v_today + 89, interval '1 day') d
    left join lateral (
      select name, type, rate_multiplier from public.seasons
      where property_id = pr.id and d::date between start_date and end_date
      order by rate_multiplier desc limit 1) s on true
    left join public.rate_calendar rc on rc.property_id = pr.id and rc.date = d::date
    where not exists (select 1 from booked b where b.property_id = pr.id and b.night = d::date)
      and coalesce(rc.is_blocked, false) = false
  ),
  f as (
    select d.*,
           coalesce(d.override_rate, round(d.base_rate * d.season_mult, -4)) as current_rate,
           case when extract(isodow from d.date) in (5, 6) then 1.10 else 1.0 end as f_weekend,
           case when d.nearby_occ >= 0.8 then 1.10 when d.nearby_occ >= 0.6 then 1.05 else 1.0 end as f_demand,
           case when d.lead_days <= 7 and coalesce(d.fwd30, 100) < 50 then 0.85
                when d.lead_days <= 14 and coalesce(d.fwd30, 100) < 50 then 0.90 else 1.0 end as f_lastmin,
           case when d.hist_occ >= 80 then 1.05 when d.hist_occ < 40 then 0.95 else 1.0 end as f_hist
    from days d
  ),
  r as (
    select f.*,
           f.base_rate * f.season_mult * f.f_weekend * f.f_demand * f.f_lastmin * f.f_hist as raw_rate
    from f
  ),
  c as (
    select r.*,
           case when r.comp_median is null then r.raw_rate
                else least(greatest(r.raw_rate, r.comp_median * 0.85), r.comp_median * 1.15) end as comp_rate
    from r
  )
  select c.id, c.date, c.current_rate,
         round(least(greatest(c.comp_rate, c.floor_rate), c.ceil_rate) / 50000) * 50000,
         jsonb_strip_nulls(jsonb_build_object(
           'base_rate', c.base_rate,
           'season', case when c.season_mult <> 1 then jsonb_build_object('name', c.season_name, 'multiplier', c.season_mult) end,
           'weekend', case when c.f_weekend > 1 then true end,
           'nearby_occupancy_pct', round(c.nearby_occ * 100),
           'demand_adj', case when c.f_demand <> 1 then c.f_demand end,
           'last_minute_adj', case when c.f_lastmin <> 1 then c.f_lastmin end,
           'forward_30d_occupancy_pct', c.fwd30,
           'history_90d_occupancy_pct', c.hist_occ,
           'history_adj', case when c.f_hist <> 1 then c.f_hist end,
           'competitor_median', round(c.comp_median, -3),
           'clamped', case when c.comp_rate < c.floor_rate then 'min' when c.comp_rate > c.ceil_rate then 'max' end,
           'override', c.override_rate is not null))
  from c;
  get diagnostics v_n = row_count;

  -- Alert peluang harga: >= 3 tanggal (30 hari ke depan) dengan selisih rekomendasi >= 15%
  insert into public.alerts (org_id, property_id, type, severity, title, data, dedup_key)
  select p.org_id, p.id, 'pricing_opportunity', 'info',
         format('%s tanggal di %s punya rekomendasi harga berbeda ≥15%% (%s naik, %s turun)',
                count(*), p.name, count(*) filter (where rr.change_pct > 0), count(*) filter (where rr.change_pct < 0)),
         jsonb_build_object('dates', count(*), 'up', count(*) filter (where rr.change_pct > 0),
                            'down', count(*) filter (where rr.change_pct < 0)),
         format('pricing:%s:%s', p.id, to_char(v_today, 'IYYY-IW'))
  from public.rate_recommendations rr join public.properties p on p.id = rr.property_id
  where p.org_id = any(v_orgs) and rr.date < v_today + 30 and abs(rr.change_pct) >= 15
  group by p.org_id, p.id, p.name
  having count(*) >= 3
  on conflict (org_id, dedup_key) do nothing;

  return v_n;
end $$;
revoke execute on function public.compute_rate_recommendations(uuid) from public, anon;
grant execute on function public.compute_rate_recommendations(uuid) to authenticated;

-- Job harian: hitung rekomendasi setelah sinkron iCal, sebelum alert
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
