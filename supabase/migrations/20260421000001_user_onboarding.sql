create table public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  industry text not null,
  company_size text not null,
  role text not null,
  referral_sources text[] not null
    check (array_length(referral_sources, 1) between 1 and 20),
  build_goals text[] not null
    check (array_length(build_goals, 1) between 1 and 20),
  created_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

create policy "Users read own onboarding"
  on public.user_onboarding for select using (auth.uid() = user_id);

create policy "Users insert own onboarding"
  on public.user_onboarding for insert with check (auth.uid() = user_id);
