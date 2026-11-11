-- (Versi awal; digantikan oleh 20261111064005_phase7a_forecast_pace.sql. Isi disamakan agar setup baru langsung memakai versi final.)
-- =====================================================================
-- VILLA AI — Fase 7A: Forecast pendapatan & laba (per villa, per bulan)
-- ---------------------------------------------------------------------
-- Metode (bisa dijelaskan, tanpa "kotak hitam"):
--   1. On-the-books (OTB): malam & pendapatan yang SUDAH dipesan.
--   2. Kurva pemesanan historis: dari booking 365 hari terakhir, berapa persen
--      malam yang biasanya sudah dipesan >= L hari sebelum menginap (share(L)).
--   3. Permintaan historis F = okupansi 180 hari terakhir × malam tersedia.
--      Yang biasanya sudah dipesan saat ini = F × share(L), L = hari ke pertengahan bulan.
--      Pace = OTB / (F × share)  (dibatasi 0,5–1,5; =1 jika data terlalu sedikit).
--      Tambahan = F × (1 − share) × pace, dibatasi malam kosong.
--      Total akhir dibatasi maks(OTB, F × 1,15) agar tidak terlalu optimistis.
--   4. Pendapatan tambahan = malam tambahan × rata-rata harga berlaku
--      (kalender harga) pada malam yang masih kosong.
--   5. Pengeluaran = rata-rata 3 bulan penuh terakhir (+ bagian biaya bersama).
-- =====================================================================

create or replace function public.forecast_revenue(p_org uuid, p_months int default 3)
returns table (
  property_id uuid, property_name text, month date, available_nights int,
  otb_nights int, otb_revenue numeric, history_occupancy_pct numeric, booked_ahead_share_pct numeric,
  pickup_nights int, forecast_nights int, forecast_occupancy_pct numeric, forecast_adr numeric,
  forecast_revenue numeric, forecast_commission numeric, forecast_expenses numeric, forecast_profit numeric,
  confidence text
)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := public.local_today();
begin
  if auth.uid() is not null and not public.can_write_org(p_org) then raise exception 'Tidak punya akses'; end if;
  if p_months < 1 or p_months > 12 then raise exception 'p_months 1–12'; end if;

  return query
  with props as (
    select p.id, p.name, p.base_rate, p.opening_date
    from public.properties p where p.org_id = p_org and p.status = 'active'
  ),
  hist_nights as (
    select bn.property_id as pid, bn.night, bn.gross_per_night, bn.commission_per_night,
           greatest(0, bn.night - (b.booked_at at time zone 'Asia/Makassar')::date) as lead
    from public.v_booking_nights bn
    join public.bookings b on b.id = bn.booking_id
    join props on props.id = bn.property_id
    where bn.night >= v_today - 365 and bn.night < v_today
  ),
  hist as (
    select pr.id as pid,
           (select count(*) from hist_nights h where h.pid = pr.id) as n_nights,
           round(100.0 * (select count(*) from hist_nights h where h.pid = pr.id and h.night >= v_today - 180)
                 / greatest(1, v_today - greatest(v_today - 180, coalesce(pr.opening_date, v_today - 180))), 1) as occ180,
           (select sum(h.commission_per_night) / nullif(sum(h.gross_per_night), 0) from hist_nights h where h.pid = pr.id) as comm_ratio
    from props pr
  ),
  months as (
    select pr.id as pid, m::date as mstart, (m + interval '1 month')::date as mend
    from props pr cross join generate_series(date_trunc('month', v_today), date_trunc('month', v_today) + make_interval(months => p_months - 1), interval '1 month') m
  ),
  nights as (
    select mo.pid, mo.mstart, d::date as night,
           bn.gross_per_night, bn.commission_per_night,
           coalesce(rc.rate, round(pr.base_rate * coalesce(s.rate_multiplier, 1), -4)) as eff_rate,
           coalesce(rc.is_blocked, false) as blocked
    from months mo
    join props pr on pr.id = mo.pid
    cross join generate_series(greatest(mo.mstart, coalesce(pr.opening_date, mo.mstart)), mo.mend - 1, interval '1 day') d
    left join public.v_booking_nights bn on bn.property_id = mo.pid and bn.night = d::date
    left join public.rate_calendar rc on rc.property_id = mo.pid and rc.date = d::date
    left join lateral (select se.rate_multiplier from public.seasons se where se.property_id = mo.pid
                       and d::date between se.start_date and se.end_date order by se.rate_multiplier desc limit 1) s on true
  ),
  agg as (
    select n.pid, n.mstart,
           count(*) filter (where not n.blocked) as avail,
           count(n.gross_per_night) as otb_n,
           coalesce(sum(n.gross_per_night), 0) as otb_rev,
           coalesce(sum(n.commission_per_night), 0) as otb_comm,
           count(*) filter (where n.gross_per_night is null and not n.blocked and n.night >= v_today) as open_future,
           avg(n.eff_rate) filter (where n.gross_per_night is null and not n.blocked and n.night >= v_today) as open_rate,
           greatest(0, (n.mstart + 14) - v_today) as lead_mid
    from nights n group by n.pid, n.mstart
  ),
  shr as (
    select a.pid, a.mstart,
           (select count(*) filter (where h.lead >= a.lead_mid)::numeric / nullif(count(*), 0)
              from hist_nights h where h.pid = a.pid) as s
    from agg a
  ),
  expenses as (
    select pr.id as pid,
      coalesce((select sum(t.amount) / 3 from public.transactions t
                where t.property_id = pr.id and t.type = 'expense'
                  and t.date >= (date_trunc('month', v_today) - interval '3 months') and t.date < date_trunc('month', v_today)), 0)
      + coalesce((select sum(t.amount) / 3 from public.transactions t
                  where t.org_id = p_org and t.property_id is null and t.type = 'expense'
                    and t.date >= (date_trunc('month', v_today) - interval '3 months') and t.date < date_trunc('month', v_today)), 0)
        / greatest(1, (select count(*) from props)) as monthly
    from props pr
  ),
  calc as (
    select a.*, pr.name, h.n_nights, h.occ180, coalesce(h.comm_ratio, 0) as comm_ratio, coalesce(sh.s, 1) as s, e.monthly,
           coalesce(h.occ180, 0) / 100.0 * a.avail as f_dem
    from agg a join props pr on pr.id = a.pid join hist h on h.pid = a.pid
    left join shr sh on sh.pid = a.pid and sh.mstart = a.mstart
    join expenses e on e.pid = a.pid
  ),
  calc2 as (
    select c.*,
           case when c.f_dem * c.s >= 3 then least(1.5, greatest(0.5, c.otb_n / (c.f_dem * c.s))) else 1 end as pace
    from calc c
  ),
  calc3 as (
    select c.*,
           least(c.open_future,
                 greatest(0, least(round(c.f_dem * (1 - c.s) * c.pace),
                                   greatest(c.otb_n, round(c.f_dem * 1.15)) - c.otb_n)))::int as pickup
    from calc2 c
  )
  select c.pid, c.name, c.mstart, c.avail::int,
         c.otb_n::int, round(c.otb_rev), c.occ180, round(100 * c.s, 1),
         c.pickup, (c.otb_n + c.pickup)::int,
         round(100.0 * (c.otb_n + c.pickup) / nullif(c.avail, 0), 1),
         round((c.otb_rev + c.pickup * coalesce(c.open_rate, 0)) / nullif(c.otb_n + c.pickup, 0)),
         round(c.otb_rev + c.pickup * coalesce(c.open_rate, 0)),
         round(c.otb_comm + c.pickup * coalesce(c.open_rate, 0) * c.comm_ratio),
         round(c.monthly),
         round(c.otb_rev + c.pickup * coalesce(c.open_rate, 0)
               - (c.otb_comm + c.pickup * coalesce(c.open_rate, 0) * c.comm_ratio) - c.monthly),
         case when c.n_nights < 30 then 'rendah'
              when c.s >= 0.7 then 'tinggi' when c.s >= 0.4 then 'sedang' else 'rendah' end
  from calc3 c
  order by c.name, c.mstart;
end $$;
revoke execute on function public.forecast_revenue(uuid, int) from public, anon;
grant execute on function public.forecast_revenue(uuid, int) to authenticated;
