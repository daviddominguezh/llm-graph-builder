create or replace function public.list_user_providers(p_email text)
returns text[]
language plpgsql
security definer set search_path = ''
as $$
declare
  v_providers text[];
begin
  select coalesce(array_agg(distinct i.provider), '{}')::text[]
    into v_providers
  from auth.users u
  join auth.identities i on i.user_id = u.id
  where u.email = lower(p_email);
  return v_providers;
end;
$$;

revoke execute on function public.list_user_providers(text) from public, anon, authenticated;
grant  execute on function public.list_user_providers(text) to service_role;

create or replace function public.reject_oauth_duplicate(p_uid uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_email text;
  v_survivor_id uuid;
begin
  select u.email into v_email from auth.users u where u.id = p_uid;
  if v_email is null then
    return jsonb_build_object('duplicate', false);
  end if;

  select u.id into v_survivor_id
  from auth.users u
  where u.email = v_email
    and u.id <> p_uid
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email')
  limit 1
  for update;

  if v_survivor_id is null then
    return jsonb_build_object('duplicate', false);
  end if;

  delete from auth.users where id = p_uid;
  return jsonb_build_object('duplicate', true, 'email', v_email);
end;
$$;

revoke execute on function public.reject_oauth_duplicate(uuid) from public, anon, authenticated;
grant  execute on function public.reject_oauth_duplicate(uuid) to service_role;

create or replace function public.get_safe_identities(p_user_id uuid)
returns table (provider text, email text, created_at timestamptz)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
    select i.provider, i.identity_data ->> 'email', i.created_at
    from auth.identities i
    where i.user_id = p_user_id;
end;
$$;

revoke execute on function public.get_safe_identities(uuid) from public, anon, authenticated;
grant  execute on function public.get_safe_identities(uuid) to service_role;

-- These indexes on auth.users require table ownership (supabase_auth_admin).
-- On hosted Supabase the postgres role is a superuser and succeeds.
-- On local dev, ignore permission errors since users_phone_key already
-- enforces uniqueness and the performance index is non-critical.
do $$
begin
  begin
    create unique index if not exists auth_users_phone_any_unique
      on auth.users (phone)
      where phone is not null;
  exception when insufficient_privilege then
    raise notice 'auth_users_phone_any_unique: skipped (insufficient privilege — local dev only)';
  end;

  begin
    create index if not exists auth_users_phone_change_sent_idx
      on auth.users (phone_change_sent_at)
      where phone_confirmed_at is null and phone is not null;
  exception when insufficient_privilege then
    raise notice 'auth_users_phone_change_sent_idx: skipped (insufficient privilege — local dev only)';
  end;
end;
$$;

create table public.otp_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  fails smallint not null default 0,
  locked_until timestamptz,
  resends_24h smallint not null default 0,
  resends_window_start timestamptz,
  distinct_phones_today smallint not null default 0,
  distinct_phones_window_start timestamptz,
  primary key (user_id, phone)
);

alter table public.otp_attempts enable row level security;
revoke all on public.otp_attempts from anon, authenticated;
grant  select, insert, update, delete on public.otp_attempts to service_role;

create table public.otp_cooldowns (
  user_id uuid primary key references auth.users(id) on delete cascade,
  next_allowed_at timestamptz not null
);

alter table public.otp_cooldowns enable row level security;
revoke all on public.otp_cooldowns from anon, authenticated;
grant  select, insert, update, delete on public.otp_cooldowns to service_role;
