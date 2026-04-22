-- Replace the per-minute sweep_abandoned_phones cron with a just-in-time
-- reclaim function. The backend calls this on phone_taken conflict from
-- phoneSendOtp; the cron was idle work 99% of the time and imposed a
-- 30-minute UX floor on legitimate retries.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep_abandoned_phones') then
    perform cron.unschedule('sweep_abandoned_phones');
  end if;
end;
$$;

create or replace function public.reclaim_stale_phone(p_phone text, p_user_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update auth.users
     set phone = null
   where phone = p_phone
     and phone_confirmed_at is null
     and phone_change_sent_at < now() - interval '30 minutes'
     and id <> p_user_id;
  return found;
end;
$$;

revoke execute on function public.reclaim_stale_phone(text, uuid) from public, anon, authenticated;
grant  execute on function public.reclaim_stale_phone(text, uuid) to service_role;
