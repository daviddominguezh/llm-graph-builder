-- ============================================================================
-- Fix: Self-referencing RLS policies on org_members cause infinite recursion.
-- Solution: SECURITY DEFINER helper functions bypass RLS for membership checks.
-- ============================================================================

-- 1. Create helper functions
-- ============================================================================

create or replace function public.is_org_member(check_org_id uuid)
returns boolean
language sql
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = check_org_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_owner(check_org_id uuid)
returns boolean
language sql
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where org_id = check_org_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

-- 2. Fix organizations policies
-- ============================================================================

drop policy if exists "Org members can read their orgs" on public.organizations;
create policy "Org members can read their orgs"
  on public.organizations for select
  using (public.is_org_member(id));

drop policy if exists "Org owners can update their orgs" on public.organizations;
create policy "Org owners can update their orgs"
  on public.organizations for update
  using (public.is_org_owner(id));

drop policy if exists "Org owners can delete their orgs" on public.organizations;
create policy "Org owners can delete their orgs"
  on public.organizations for delete
  using (public.is_org_owner(id));

-- 3. Fix org_members policies (the self-referencing ones)
-- ============================================================================

drop policy if exists "Members can read their org members" on public.org_members;
create policy "Members can read their org members"
  on public.org_members for select
  using (public.is_org_member(org_id));

drop policy if exists "Org owners can add members" on public.org_members;
create policy "Org owners can add members"
  on public.org_members for insert
  with check (public.is_org_owner(org_id));

drop policy if exists "Org owners can remove members" on public.org_members;
create policy "Org owners can remove members"
  on public.org_members for delete
  using (public.is_org_owner(org_id));

-- 4. Fix agents policies
-- ============================================================================

drop policy if exists "Org members can read agents" on public.agents;
create policy "Org members can read agents"
  on public.agents for select
  using (public.is_org_member(org_id));

drop policy if exists "Org members can create agents" on public.agents;
create policy "Org members can create agents"
  on public.agents for insert
  with check (public.is_org_member(org_id));

drop policy if exists "Org members can update agents" on public.agents;
create policy "Org members can update agents"
  on public.agents for update
  using (public.is_org_member(org_id));

drop policy if exists "Org members can delete agents" on public.agents;
create policy "Org members can delete agents"
  on public.agents for delete
  using (public.is_org_member(org_id));

-- 5. Fix org_api_keys policies
-- ============================================================================

drop policy if exists "Org members can read API keys" on public.org_api_keys;
create policy "Org members can read API keys"
  on public.org_api_keys for select
  using (public.is_org_member(org_id));

drop policy if exists "Org members can create API keys" on public.org_api_keys;
create policy "Org members can create API keys"
  on public.org_api_keys for insert
  to authenticated
  with check (public.is_org_member(org_id));

drop policy if exists "Org members can delete API keys" on public.org_api_keys;
create policy "Org members can delete API keys"
  on public.org_api_keys for delete
  to authenticated
  using (public.is_org_member(org_id));
