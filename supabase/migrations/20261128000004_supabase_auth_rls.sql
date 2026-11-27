-- Legacy registrations did not verify identity. Keep those rows private
-- until ownership can be independently established.
alter table public.app_accounts enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_records enable row level security;
revoke all on public.app_accounts, public.app_sessions, public.app_records from public, anon, authenticated;

alter table public.records enable row level security;
drop policy if exists "Users can manage their own records" on public.records;
create policy "Users can manage their own records" on public.records
for all to authenticated
using (owner = (select auth.uid()))
with check (owner = (select auth.uid()));
revoke all on public.records from public, anon, authenticated;
grant select, insert, update, delete on public.records to authenticated;

do $$
begin
  if exists (select from pg_publication where pubname = 'supabase_realtime')
    and not exists (select from pg_publication_tables where pubname = 'supabase_realtime'
                    and schemaname = 'public' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;
