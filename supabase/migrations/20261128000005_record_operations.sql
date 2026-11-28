alter table public.records add column file_base64 text,
  add column revision bigint not null default 0;

-- Preserve uploads from the earlier API, which stored their bytes in payload.
update public.records set file_base64 = payload->>'file',
  mime = coalesce(mime, payload->>'mime'), payload = payload - 'file' - 'mime'
where section = 'prescriptions' and jsonb_typeof(payload->'file') = 'string';

create function public.pharmalert_record_revision() returns trigger
language plpgsql set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end $$;
create trigger pharmalert_record_revision before update on public.records
for each row execute function public.pharmalert_record_revision();

create function public.pharmalert_record_dose(reminder uuid, scheduled text, outcome text)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  rec public.records%rowtype;
  next_time timestamptz;
begin
  select * into rec from public.records where owner = auth.uid()
    and id = reminder and section = 'reminders' for update;
  if not found then return 404; end if;
  if outcome is null or outcome not in ('taken','skipped') or scheduled is null then return 400; end if;
  if rec.payload->>'scheduled_at' is distinct from scheduled then return 409; end if;
  if coalesce(rec.payload->>'repeat','') not in ('once','daily','weekly') then return 400; end if;
  if rec.payload->>'repeat' = 'once' then
    delete from public.records where id = rec.id;
  else
    next_time := scheduled::timestamptz + case rec.payload->>'repeat' when 'daily' then interval '24 hours' else interval '168 hours' end;
    update public.records set payload=jsonb_set(payload,'{scheduled_at}',to_jsonb(to_char(next_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) where id=rec.id;
  end if;
  insert into public.records(owner, section, payload) values(rec.owner,'reminder_logs',
    jsonb_build_object('reminder_id',rec.id,'scheduled_at',scheduled,'outcome',outcome,'dosage',rec.payload->'dosage'));
  return 200;
end $$;
revoke all on function public.pharmalert_record_dose(uuid,text,text) from public, anon;
grant execute on function public.pharmalert_record_dose(uuid,text,text) to authenticated;
