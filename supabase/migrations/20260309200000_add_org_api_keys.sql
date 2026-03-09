-- ============================================================================
-- 1. Create org_api_keys table
-- ============================================================================

create table public.org_api_keys (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null,
  key_value  text not null,
  created_at timestamptz not null default now()
);

create index idx_org_api_keys_org_id on public.org_api_keys(org_id);

-- ============================================================================
-- 2. RLS on org_api_keys
-- ============================================================================

alter table public.org_api_keys enable row level security;

create policy "Org members can read API keys"
  on public.org_api_keys for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_api_keys.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Org members can create API keys"
  on public.org_api_keys for insert
  to authenticated
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_api_keys.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Org members can delete API keys"
  on public.org_api_keys for delete
  to authenticated
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = org_api_keys.org_id
        and org_members.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 3. Add API key foreign keys to agents table
-- ============================================================================

alter table public.agents
  add column staging_api_key_id uuid references public.org_api_keys(id) on delete set null;

alter table public.agents
  add column production_api_key_id uuid references public.org_api_keys(id) on delete set null;
