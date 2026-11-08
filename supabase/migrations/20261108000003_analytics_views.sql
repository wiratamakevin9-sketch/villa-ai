-- =====================================================================
-- VILLA AI — Migrasi 3: View analitik (sumber angka untuk dashboard & AI)
-- ---------------------------------------------------------------------
-- Semua KPI dihitung di sini dengan SQL. AI agent TIDAK menghitung sendiri;
-- ia membaca hasil view ini, lalu menjelaskan dan memberi rekomendasi.
--
-- security_invoker = true → view mengikuti aturan RLS user yang membaca.
--
-- Definisi KPI:
--   Okupansi  = malam terisi / malam tersedia
--   ADR       = pendapatan kamar / malam terisi    (Average Daily Rate)
--   RevPAR    = pendapatan kamar / malam tersedia  (Revenue per Available Night)
--   Laba      = pendapatan kamar + pendapatan lain - komisi OTA - pengeluaran
-- Pendapatan booking dibagi rata per malam, sehingga booking yang melewati
-- akhir bulan terbagi ke bulan yang benar.
-- =====================================================================

-- 1) Satu baris per malam terisi
create or replace view public.v_booking_nights
with (security_invoker = true) as
select
  b.property_id,
  b.id                                   as booking_id,
  b.channel_id,
  d::date                                as night,
  round(b.gross_amount / b.nights, 2)    as gross_per_night,
  round(b.commission_amount / b.nights, 2) as commission_per_night
from public.bookings b
cross join lateral generate_series(b.check_in, b.check_out - 1, interval '1 day') as d
where b.status in ('confirmed', 'checked_in', 'completed');

-- 2) Kalender per properti per bulan (dari bulan buka s/d 12 bulan ke depan)
create or replace view public.v_property_months
with (security_invoker = true) as
select
  p.id      as property_id,
  p.org_id,
  m::date   as month,
  -- malam tersedia: hari di bulan itu sejak tanggal buka villa
  greatest(0,
    ((m + interval '1 month')::date - greatest(m::date, coalesce(p.opening_date, m::date)))
  )::int    as available_nights
from public.properties p
cross join lateral generate_series(
  date_trunc('month', coalesce(p.opening_date, p.created_at::date)),
  date_trunc('month', current_date + interval '12 months'),
  interval '1 month'
) as m
where p.status = 'active';

-- 3) KPI bulanan per villa
create or replace view public.v_monthly_kpi
with (security_invoker = true) as
with nights as (
  select property_id, date_trunc('month', night)::date as month,
         count(*)                  as occupied_nights,
         sum(gross_per_night)      as room_revenue,
         sum(commission_per_night) as commission
  from public.v_booking_nights
  group by 1, 2
),
tx as (
  select property_id, date_trunc('month', date)::date as month,
         sum(amount) filter (where type = 'income')  as other_income,
         sum(amount) filter (where type = 'expense') as expenses
  from public.transactions
  where property_id is not null
  group by 1, 2
)
select
  pm.org_id,
  pm.property_id,
  p.name                                         as property_name,
  pm.month,
  pm.available_nights,
  coalesce(n.occupied_nights, 0)::int            as occupied_nights,
  round(100.0 * coalesce(n.occupied_nights, 0) / nullif(pm.available_nights, 0), 1) as occupancy_pct,
  coalesce(n.room_revenue, 0)                    as room_revenue,
  coalesce(n.commission, 0)                      as commission,
  coalesce(t.other_income, 0)                    as other_income,
  coalesce(t.expenses, 0)                        as expenses,
  round(coalesce(n.room_revenue, 0) / nullif(n.occupied_nights, 0), 0) as adr,
  round(coalesce(n.room_revenue, 0) / nullif(pm.available_nights, 0), 0) as revpar,
  coalesce(n.room_revenue, 0) + coalesce(t.other_income, 0)
    - coalesce(n.commission, 0) - coalesce(t.expenses, 0) as net_profit
from public.v_property_months pm
join public.properties p on p.id = pm.property_id
left join nights n on n.property_id = pm.property_id and n.month = pm.month
left join tx     t on t.property_id = pm.property_id and t.month = pm.month;

-- 4) Biaya bersama (property_id = null), mis. gaji manajer untuk semua villa
create or replace view public.v_monthly_shared_expenses
with (security_invoker = true) as
select org_id, date_trunc('month', date)::date as month, sum(amount) as shared_expenses
from public.transactions
where property_id is null and type = 'expense'
group by 1, 2;

-- 5) Performa per channel (Airbnb vs Direct, dst.)
create or replace view public.v_channel_performance
with (security_invoker = true) as
select
  bn.property_id,
  date_trunc('month', bn.night)::date  as month,
  c.id                                 as channel_id,
  coalesce(c.name, 'Tidak diketahui')  as channel_name,
  coalesce(c.type, 'other')            as channel_type,
  count(*)                             as nights,
  count(distinct bn.booking_id)        as bookings,
  sum(bn.gross_per_night)              as gross_revenue,
  sum(bn.commission_per_night)         as commission,
  sum(bn.gross_per_night - bn.commission_per_night) as net_revenue
from public.v_booking_nights bn
left join public.channels c on c.id = bn.channel_id
group by 1, 2, 3, 4, 5;

-- 6) Pengeluaran per kategori per bulan + rata-rata 3 bulan sebelumnya
--    → dasar deteksi pengeluaran tidak wajar (Fase 3)
create or replace view public.v_expense_baseline
with (security_invoker = true) as
with monthly as (
  select t.property_id, t.category_id, cat.name as category_name,
         date_trunc('month', t.date)::date as month, sum(t.amount) as amount
  from public.transactions t
  join public.categories cat on cat.id = t.category_id
  where t.type = 'expense'
  group by 1, 2, 3, 4
)
select
  m.*,
  round(avg(m.amount) over w, 0) as avg_prev_3_months,
  round(m.amount / nullif(avg(m.amount) over w, 0), 2) as ratio_vs_avg
from monthly m
window w as (partition by m.property_id, m.category_id order by m.month
             rows between 3 preceding and 1 preceding);

-- 7) Booking pace: berapa malam sudah terisi untuk 30/60/90 hari ke depan
create or replace view public.v_forward_occupancy
with (security_invoker = true) as
select
  p.org_id,
  p.id as property_id,
  p.name as property_name,
  h.days as horizon_days,
  count(bn.night)::int as booked_nights,
  round(100.0 * count(bn.night) / h.days, 1) as occupancy_pct
from public.properties p
cross join (values (30), (60), (90)) as h(days)
left join public.v_booking_nights bn
  on bn.property_id = p.id
 and bn.night >= current_date
 and bn.night <  current_date + h.days
where p.status = 'active'
group by 1, 2, 3, 4;
