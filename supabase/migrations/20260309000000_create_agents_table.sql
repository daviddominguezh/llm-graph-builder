create table public.agents (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  name                  text not null,
  slug                  text not null unique,
  description           text default '',
  graph_data_staging    jsonb not null default '{}',
  graph_data_production jsonb not null default '{}',
  version               integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_agents_user_id on public.agents(user_id);
create index idx_agents_slug on public.agents(slug);

alter table public.agents enable row level security;

create policy "Users can read their own agents"
  on public.agents for select
  using (auth.uid() = user_id);

create policy "Users can insert their own agents"
  on public.agents for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own agents"
  on public.agents for update
  using (auth.uid() = user_id);

create policy "Users can delete their own agents"
  on public.agents for delete
  using (auth.uid() = user_id);

create or replace function public.update_agents_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_agents_updated
  before update on public.agents
  for each row execute function public.update_agents_updated_at();
