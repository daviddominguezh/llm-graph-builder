alter table public.users
  add column grandfathered_at timestamptz;

update public.users u
  set grandfathered_at = now(),
      onboarding_completed_at = now()
  where u.created_at < now()
    and not exists (select 1 from public.user_onboarding o where o.user_id = u.id);
