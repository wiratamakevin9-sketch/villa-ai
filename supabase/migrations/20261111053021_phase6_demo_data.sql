-- ---------------------------------------------------------------------
-- 6) Data contoh: tanpa tugas manual (trigger yang membuat), + aset contoh
-- ---------------------------------------------------------------------
create or replace function public.load_demo_data(p_org uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_villa      record;
  v_prop       uuid;
  v_guest      uuid;
  v_channel    record;
  v_day        date;
  v_end        date := (date_trunc('month', current_date) + interval '4 months')::date;
  v_start      date := (date_trunc('month', current_date) - interval '6 months')::date;
  v_nights     int;
  v_gap        int;
  v_mult       numeric;
  v_rate       numeric;
  v_gross      numeric;
  v_month      date;
  v_occ        int;
  v_bookings   int := 0;
  v_names      text[] := array['Sarah Miller','Kenji Tanaka','Budi Santoso','Emma Wilson','Lukas Schmidt',
                                'Ayu Lestari','Liam Brown','Chen Wei','Sophie Martin','Rizky Pratama',
                                'Olivia Taylor','Hiro Sato','Dewi Anggraini','Noah Davis','Mia Rossi'];
  v_countries  text[] := array['Australia','Jepang','Indonesia','Inggris','Jerman',
                               'Indonesia','Australia','China','Prancis','Indonesia',
                               'Amerika Serikat','Jepang','Indonesia','Kanada','Italia'];
  r            int;
  v_pick       float8;
  v_channel_name text;
begin
  if not public.is_org_owner(p_org) then
    raise exception 'Hanya owner yang boleh memuat data contoh';
  end if;
  if exists (select 1 from public.properties where org_id = p_org and notes = '[DEMO]') then
    raise exception 'Data contoh sudah dimuat. Hapus dulu dengan clear_demo_data().';
  end if;

  perform setseed(0.42);  -- hasil acak tetap sama setiap kali dimuat

  -- Staf contoh lebih dulu agar tugas otomatis langsung ter-assign
  insert into public.staff (org_id, name, role, monthly_salary, phone) values
    (p_org, 'Made (contoh)',  'housekeeping', 3200000, null),
    (p_org, 'Ketut (contoh)', 'maintenance',  2800000, null),
    (p_org, 'Wayan (contoh)', 'manager',      6500000, null);

  for v_villa in
    select * from (values
      ('Villa Sawah Indah',  'VSI', 'Ubud, Gianyar',      2, 2,  4, 2200000::numeric, 3500000000::numeric, 0.62),
      ('Villa Pantai Biru',  'VPB', 'Canggu, Badung',     3, 3,  6, 3800000::numeric, 6000000000::numeric, 0.72),
      ('Villa Tebing Senja', 'VTS', 'Uluwatu, Badung',    4, 4,  8, 5500000::numeric, 9500000000::numeric, 0.55)
    ) as t(name, code, location, bedrooms, bathrooms, max_guests, base_rate, purchase_price, demand)
  loop
    insert into public.properties (org_id, name, code, location, bedrooms, bathrooms, max_guests,
                                   base_rate, purchase_price, opening_date, notes)
    values (p_org, v_villa.name, v_villa.code, v_villa.location, v_villa.bedrooms, v_villa.bathrooms,
            v_villa.max_guests, v_villa.base_rate, v_villa.purchase_price, v_start, '[DEMO]')
    returning id into v_prop;

    -- Musim (pola umum Bali)
    insert into public.seasons (property_id, name, type, start_date, end_date, rate_multiplier)
    select v_prop, s.name, s.type, s.sd, s.ed, s.mult
    from (values
      ('Low Season',     'low',      make_date(extract(year from current_date)::int, 1, 8),  make_date(extract(year from current_date)::int, 3, 31), 0.85),
      ('Shoulder',       'shoulder', make_date(extract(year from current_date)::int, 4, 1),  make_date(extract(year from current_date)::int, 6, 30), 1.00),
      ('High Season',    'high',     make_date(extract(year from current_date)::int, 7, 1),  make_date(extract(year from current_date)::int, 8, 31), 1.30),
      ('Shoulder',       'shoulder', make_date(extract(year from current_date)::int, 9, 1),  make_date(extract(year from current_date)::int, 12, 19), 1.00),
      ('Peak Natal & Tahun Baru', 'peak', make_date(extract(year from current_date)::int, 12, 20), make_date(extract(year from current_date)::int + 1, 1, 7), 1.60),
      ('Low Season',     'low',      make_date(extract(year from current_date)::int + 1, 1, 8), make_date(extract(year from current_date)::int + 1, 3, 31), 0.85)
    ) as s(name, type, sd, ed, mult);

    -- Booking: berjalan dari awal sampai akhir periode
    v_day := v_start + (random()::numeric * 3)::int;
    while v_day < v_end loop
      select coalesce(max(rate_multiplier), 1.0) into v_mult
      from public.seasons where property_id = v_prop and v_day between start_date and end_date;

      v_nights := 2 + (random()::numeric * 4)::int;              -- 2–6 malam
      -- jeda antar booking: makin rendah demand/musim, makin lama kosong
      v_gap := greatest(0, round((1 - v_villa.demand * v_mult) * 8 + (random()::numeric * 4 - 2)))::int;
      -- tamu yang booking jauh ke depan makin sedikit
      if v_day > current_date + 45 and random()::numeric < 0.5 then
        v_day := v_day + v_nights + v_gap;
        continue;
      end if;

      v_rate  := round(v_villa.base_rate * v_mult * (0.92 + random()::numeric * 0.16), -4);
      v_gross := v_rate * v_nights;

      r := 1 + (random()::numeric * 14)::int;
      insert into public.guests (org_id, name, country, notes)
      values (p_org, v_names[r], v_countries[r], '[DEMO]')
      returning id into v_guest;

      -- Pilih channel: Airbnb 35%, Booking 25%, Direct 20%, Agoda 12%, Agent 8%
      v_pick := random()::numeric;
      v_channel_name := case
        when v_pick < 0.35 then 'Airbnb'
        when v_pick < 0.60 then 'Booking.com'
        when v_pick < 0.80 then 'Direct / WhatsApp'
        when v_pick < 0.92 then 'Agoda'
        else 'Travel Agent' end;
      select * into v_channel from public.channels
      where org_id = p_org and name = v_channel_name;

      insert into public.bookings (property_id, guest_id, channel_id, check_in, check_out, guests_count,
                                   gross_amount, commission_amount, status, source, booked_at, notes)
      values (v_prop, v_guest, v_channel.id, v_day, v_day + v_nights,
              1 + (random()::numeric * (v_villa.max_guests - 1))::int,
              v_gross, round(v_gross * v_channel.commission_pct / 100, -3),
              case when v_day + v_nights <= current_date then 'completed'
                   when v_day <= current_date then 'checked_in'
                   else 'confirmed' end,
              'manual',
              (v_day - (7 + (random()::numeric * 50)::int)),
              '[DEMO]');
      v_bookings := v_bookings + 1;

      -- tugas cleaning dibuat otomatis oleh trigger booking (Fase 6)

      v_day := v_day + v_nights + v_gap;
    end loop;

    -- Pengeluaran bulanan (hanya bulan yang sudah lewat + bulan berjalan)
    for v_month in
      select generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month')::date
    loop
      select count(*) into v_occ from public.bookings b
      cross join lateral generate_series(b.check_in, b.check_out - 1, interval '1 day') d
      where b.property_id = v_prop and b.status <> 'cancelled'
        and date_trunc('month', d) = v_month;

      insert into public.transactions (org_id, property_id, category_id, date, type, amount, description)
      select p_org, v_prop, c.id, x.dt, 'expense', x.amount, x.descr
      from (values
        ('Gaji Staf',              v_month + 24, v_villa.bedrooms * 1600000::numeric,                         'Gaji housekeeping & gardener'),
        ('Listrik',                v_month + 5,  round(900000 + v_occ * 95000 * v_villa.bedrooms / 2, -3),   'Token/tagihan PLN'),
        ('Air',                    v_month + 5,  round(150000 + v_occ * 12000, -3),                          'Tagihan PDAM'),
        ('Internet',               v_month + 3,  450000::numeric,                                           'Wifi bulanan'),
        ('Kebersihan & Laundry',   v_month + 27, round(v_occ * 85000 * v_villa.bedrooms / 2, -3),           'Laundry linen & handuk'),
        ('Amenities Tamu',         v_month + 15, round(v_occ * 40000, -3),                                   'Sabun, sampo, air mineral, kopi'),
        ('Perawatan Kolam',        v_month + 10, 600000::numeric,                                           'Chemical & servis kolam'),
        ('Maintenance & Perbaikan',v_month + 18, round(300000 + random()::numeric * 700000, -3),                      'Perbaikan kecil'),
        ('Marketing & Iklan',      v_month + 2,  round(500000 + random()::numeric * 500000, -3),                      'Iklan Instagram/Facebook')
      ) as x(cat, dt, amount, descr)
      join public.categories c on c.org_id = p_org and c.name = x.cat and c.type = 'expense'
      where x.amount > 0 and x.dt <= current_date;
    end loop;

    -- Pendapatan tambahan kecil (antar-jemput bandara, sewa motor)
    insert into public.transactions (org_id, property_id, category_id, booking_id, date, type, amount, description)
    select p_org, v_prop, c.id, b.id, b.check_in, 'income', 350000, 'Antar-jemput bandara'
    from public.bookings b
    join public.categories c on c.org_id = p_org and c.name = 'Layanan Tambahan'
    where b.property_id = v_prop and b.check_in <= current_date and random()::numeric < 0.3;
  end loop;

  -- Anomali yang disengaja: perbaikan pompa kolam besar bulan lalu di Villa Pantai Biru
  insert into public.transactions (org_id, property_id, category_id, date, type, amount, description)
  select p_org, p.id, c.id, (date_trunc('month', current_date) - interval '1 month')::date + 12,
         'expense', 7800000, 'Ganti pompa kolam rusak (darurat)'
  from public.properties p
  join public.categories c on c.org_id = p_org and c.name = 'Maintenance & Perbaikan'
  where p.org_id = p_org and p.name = 'Villa Pantai Biru';

  -- Biaya bersama semua villa
  insert into public.transactions (org_id, property_id, category_id, date, type, amount, description)
  select p_org, null, c.id, m::date + 24, 'expense', 6500000, 'Gaji manajer villa (semua properti)'
  from generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month') m
  join public.categories c on c.org_id = p_org and c.name = 'Gaji Staf'
  where m::date + 24 <= current_date;

  -- Aset contoh (jadwal servis)
  insert into public.assets (property_id, name, category, last_service_at, service_interval_days)
  select p.id, a.name, a.cat, public.local_today() - a.ago, a.every
  from public.properties p
  cross join (values ('Pompa kolam', 'Kolam', 85, 90), ('AC kamar utama', 'AC', 170, 180), ('Water heater', 'Plumbing', 40, 365))
    as a(name, cat, ago, every)
  where p.org_id = p_org and p.notes = '[DEMO]';
  perform public.generate_ops_tasks(p_org);

  -- Kompetitor contoh
  insert into public.competitors (org_id, name, location, bedrooms, notes) values
    (p_org, 'Kompetitor A (contoh)', 'Canggu, Badung', 3, '[DEMO]'),
    (p_org, 'Kompetitor B (contoh)', 'Ubud, Gianyar',  2, '[DEMO]');

  insert into public.audit_log (org_id, actor, action, entity)
  values (p_org, auth.uid(), 'load_demo_data', 'organization');

  return format('Data contoh dimuat: 3 villa, %s booking.', v_bookings);
end $$;

