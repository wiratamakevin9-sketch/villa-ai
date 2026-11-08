-- =====================================================================
-- VILLA AI — Migrasi 1: Skema inti
-- ---------------------------------------------------------------------
-- Prinsip:
--   * Semua data milik sebuah ORGANIZATION (bisnis kamu).
--   * Data operasional terikat ke PROPERTY (villa) lewat property_id,
--     jadi menambah villa baru = menambah 1 baris di tabel properties.
--   * Uang disimpan sebagai numeric(14,2) dalam mata uang organisasi (IDR).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;  -- untuk mencegah double booking

-- ---------- Helper: kolom updated_at otomatis ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =====================================================================
-- 1. ORGANISASI & AKSES
-- =====================================================================
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'IDR',
  timezone    text not null default 'Asia/Makassar',
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now()
);

create table public.memberships (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner', 'manager', 'staff')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

-- Buat profil otomatis setiap ada user baru mendaftar
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 2. PROPERTI & CHANNEL
-- =====================================================================
create table public.properties (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  code            text,                         -- kode singkat, mis. "VS" untuk Villa Sunset
  location        text,
  bedrooms        int  check (bedrooms >= 0),
  bathrooms       int  check (bathrooms >= 0),
  max_guests      int  check (max_guests > 0),
  base_rate       numeric(14,2) check (base_rate >= 0),     -- harga dasar per malam
  purchase_price  numeric(14,2) check (purchase_price >= 0), -- nilai investasi, untuk ROI
  opening_date    date,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  ical_urls       jsonb not null default '[]'::jsonb,       -- disiapkan untuk Fase 4
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, name)
);
create index on public.properties (org_id);
create trigger trg_properties_updated before update on public.properties
  for each row execute function public.set_updated_at();

create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('ota', 'direct', 'agent', 'other')),
  commission_pct  numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  active          boolean not null default true,
  unique (org_id, name)
);

-- =====================================================================
-- 3. TAMU & BOOKING
-- =====================================================================
create table public.guests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  country     text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index on public.guests (org_id);

create table public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references public.properties(id) on delete cascade,
  guest_id           uuid references public.guests(id) on delete set null,
  channel_id         uuid references public.channels(id) on delete set null,
  external_ref       text,                         -- kode booking dari OTA
  check_in           date not null,
  check_out          date not null,
  nights             int generated always as (check_out - check_in) stored,
  guests_count       int check (guests_count > 0),
  gross_amount       numeric(14,2) not null default 0 check (gross_amount >= 0),
  commission_amount  numeric(14,2) not null default 0 check (commission_amount >= 0),
  net_amount         numeric(14,2) generated always as (gross_amount - commission_amount) stored,
  status             text not null default 'confirmed'
                     check (status in ('inquiry', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show')),
  source             text not null default 'manual' check (source in ('manual', 'import', 'ical', 'api', 'whatsapp')),
  booked_at          timestamptz not null default now(),
  cancelled_at       timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (check_out > check_in),
  -- Kunci anti double-booking: satu villa tidak bisa punya 2 booking aktif di malam yang sama
  constraint no_double_booking exclude using gist (
    property_id with =,
    daterange(check_in, check_out, '[)') with &&
  ) where (status in ('confirmed', 'checked_in', 'completed'))
);
create index on public.bookings (property_id, check_in);
create index on public.bookings (channel_id);
create trigger trg_bookings_updated before update on public.bookings
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 4. HARGA & PASAR
-- =====================================================================
create table public.seasons (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  name         text not null,
  type         text not null check (type in ('low', 'shoulder', 'high', 'peak')),
  start_date   date not null,
  end_date     date not null,
  rate_multiplier numeric(4,2) not null default 1.00 check (rate_multiplier > 0),
  check (end_date >= start_date)
);
create index on public.seasons (property_id, start_date);

create table public.rate_calendar (
  property_id  uuid not null references public.properties(id) on delete cascade,
  date         date not null,
  rate         numeric(14,2) not null check (rate >= 0),
  min_stay     int not null default 1 check (min_stay >= 1),
  is_blocked   boolean not null default false,
  primary key (property_id, date)
);

create table public.rate_change_log (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  date_from    date not null,
  date_to      date not null,
  old_rate     numeric(14,2),
  new_rate     numeric(14,2) not null,
  reason       text,
  approval_id  uuid,                          -- terisi jika berasal dari rekomendasi AI
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz not null default now()
);

create table public.competitors (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  url         text,
  location    text,
  bedrooms    int,
  notes       text,
  created_at  timestamptz not null default now()
);

create table public.competitor_rates (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references public.competitors(id) on delete cascade,
  date           date not null,                -- tanggal menginap yang dicek
  rate           numeric(14,2) not null,
  source         text,                         -- 'manual', 'web_search', dll.
  captured_at    timestamptz not null default now()
);
create index on public.competitor_rates (competitor_id, date);

-- =====================================================================
-- 5. KEUANGAN
-- ---------------------------------------------------------------------
-- Catatan: pendapatan SEWA KAMAR diambil dari tabel bookings.
-- Tabel transactions dipakai untuk PENGELUARAN dan PENDAPATAN LAIN
-- (mis. sewa motor, laundry, tur). Ini mencegah pendapatan terhitung dua kali.
-- =====================================================================
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('income', 'expense')),
  group_name text,                 -- mis. 'Operasional', 'SDM', 'Utilitas', 'Marketing'
  is_fixed   boolean not null default false,  -- biaya tetap (gaji, internet) vs variabel
  unique (org_id, name, type)
);

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete cascade, -- null = biaya bersama semua villa
  category_id     uuid not null references public.categories(id),
  booking_id      uuid references public.bookings(id) on delete set null,
  date            date not null,
  type            text not null check (type in ('income', 'expense')),
  amount          numeric(14,2) not null check (amount > 0),
  description     text,
  payment_method  text,            -- cash / transfer / qris / card
  receipt_path    text,            -- path file di Supabase Storage
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index on public.transactions (org_id, date);
create index on public.transactions (property_id, date);

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  amount       numeric(14,2) not null check (amount >= 0),
  unique (property_id, category_id, month)
);

-- =====================================================================
-- 6. OPERASIONAL
-- =====================================================================
create table public.staff (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,  -- jika staf punya akun login
  name            text not null,
  role            text,          -- housekeeping / gardener / pool / manager / security
  phone           text,
  monthly_salary  numeric(14,2),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties(id) on delete cascade,
  booking_id   uuid references public.bookings(id) on delete set null,
  type         text not null check (type in ('cleaning', 'maintenance', 'inspection', 'purchase', 'other')),
  title        text not null,
  assigned_to  uuid references public.staff(id) on delete set null,
  due_at       timestamptz,
  status       text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  cost         numeric(14,2),
  notes        text,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.tasks (property_id, status, due_at);

create table public.assets (
  id                     uuid primary key default gen_random_uuid(),
  property_id            uuid not null references public.properties(id) on delete cascade,
  name                   text not null,       -- AC kamar 1, pompa kolam, water heater
  category               text,
  purchase_date          date,
  cost                   numeric(14,2),
  last_service_at        date,
  service_interval_days  int check (service_interval_days > 0),
  notes                  text
);

-- =====================================================================
-- 7. AI & SISTEM
-- =====================================================================
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  property_id     uuid references public.properties(id) on delete cascade,
  type            text not null,     -- 'low_occupancy', 'expense_anomaly', 'competitor_price', ...
  severity        text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title           text not null,
  data            jsonb not null default '{}'::jsonb,   -- angka pemicu (dihitung SQL)
  ai_explanation  text,                                  -- penjelasan + rekomendasi dari AI
  status          text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at      timestamptz not null default now()
);
create index on public.alerts (org_id, status, created_at desc);

create table public.approvals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  action_type   text not null,       -- 'rate_change', 'send_whatsapp', 'create_task', ...
  payload       jsonb not null,
  reason        text,                -- alasan AI mengusulkan aksi ini
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'executed', 'failed')),
  proposed_at   timestamptz not null default now(),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz
);
create index on public.approvals (org_id, status);

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  property_id   uuid references public.properties(id) on delete cascade, -- null = gabungan semua villa
  period_type   text not null check (period_type in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  period_start  date not null,
  period_end    date not null,
  metrics       jsonb not null,
  ai_summary    text,
  file_path     text,
  created_at    timestamptz not null default now()
);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  file_path       text not null,
  file_name       text,
  doc_type        text,     -- 'invoice', 'ota_payout', 'bank_statement', ...
  extracted_data  jsonb,
  processed_at    timestamptz,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now()
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          jsonb not null,
  created_at       timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  actor      uuid,           -- user, atau null jika oleh sistem/AI
  actor_type text not null default 'user' check (actor_type in ('user', 'ai', 'system')),
  action     text not null,
  entity     text not null,
  entity_id  text,
  diff       jsonb,
  at         timestamptz not null default now()
);
create index on public.audit_log (org_id, at desc);
