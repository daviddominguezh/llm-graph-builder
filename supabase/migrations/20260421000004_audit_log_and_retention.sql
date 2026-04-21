-- NOTE: pg_cron must be available. Add "create extension if not exists pg_cron with schema extensions;" at the top if needed on local Supabase.
create extension if not exists pg_cron with schema extensions;

create table public.auth_audit_log (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  event text not null,
  email text,
  phone text,
  ip_truncated text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.auth_audit_log enable row level security;
revoke all on public.auth_audit_log from anon, authenticated;
grant  select, insert on public.auth_audit_log to service_role;

create index auth_audit_log_user_id_idx on public.auth_audit_log (user_id, created_at desc);
create index auth_audit_log_event_idx   on public.auth_audit_log (event, created_at desc);

create or replace function public.scrub_audit_log_on_user_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.auth_audit_log
     set email = null,
         phone = null,
         user_agent = null,
         metadata = null
   where user_id = old.id;
  return old;
end;
$$;

create trigger scrub_audit_log_after_user_delete
  after delete on auth.users
  for each row execute function public.scrub_audit_log_on_user_delete();

select cron.schedule(
  'sweep_abandoned_phones',
  '* * * * *',
  $$update auth.users set phone = null
    where phone is not null
      and phone_confirmed_at is null
      and phone_change_sent_at < now() - interval '30 minutes'$$
);

select cron.schedule(
  'retain_auth_audit_log',
  '15 3 * * *',
  $$delete from public.auth_audit_log
    where (event not in ('oauth_duplicate_rejected', 'otp_lockout')
           and created_at < now() - interval '90 days')
       or (event in ('oauth_duplicate_rejected', 'otp_lockout')
           and created_at < now() - interval '1 year')$$
);
