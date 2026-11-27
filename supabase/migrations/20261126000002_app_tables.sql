create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  token text primary key,
  owner uuid not null references public.app_accounts(id) on delete cascade,
  expires timestamptz not null
);

create table if not exists public.app_records (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.app_accounts(id) on delete cascade,
  section text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_app_records_owner_section
  on public.app_records (owner, section, created_at desc);
