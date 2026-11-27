-- PharmAlert AI initial schema
create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  section text not null,
  created_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  file_path text,
  mime text
);

create index if not exists idx_records_owner_section
  on public.records (owner, section, created_at desc);

alter table public.records enable row level security;

drop policy if exists "Users can manage their own records" on public.records;
create policy "Users can manage their own records"
  on public.records
  for all
  using (auth.uid() = owner)
  with check (auth.uid() = owner);
