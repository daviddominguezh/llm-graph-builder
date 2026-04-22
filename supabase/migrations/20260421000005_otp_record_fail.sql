create or replace function public.otp_record_fail(p_user uuid, p_phone text)
returns smallint
language plpgsql
security definer set search_path = ''
as $$
declare
  v_fails smallint;
begin
  insert into public.otp_attempts (user_id, phone, fails, locked_until)
  values (p_user, p_phone, 1, null)
  on conflict (user_id, phone) do update
    set fails = case when public.otp_attempts.locked_until < now() then 1 else public.otp_attempts.fails + 1 end,
        locked_until = case
          when (case when public.otp_attempts.locked_until < now() then 1 else public.otp_attempts.fails + 1 end) >= 5
            then now() + interval '15 minutes'
          else null
        end
  returning fails into v_fails;
  return v_fails;
end;
$$;

revoke execute on function public.otp_record_fail(uuid, text) from public, anon, authenticated;
grant  execute on function public.otp_record_fail(uuid, text) to service_role;
