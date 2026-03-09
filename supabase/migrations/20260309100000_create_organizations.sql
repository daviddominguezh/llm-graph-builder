-- ============================================================================
-- 1. Create organizations table
-- ============================================================================

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_organizations_slug on public.organizations(slug);

-- ============================================================================
-- 2. Create org_members junction table
-- ============================================================================

create table public.org_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index idx_org_members_user_id on public.org_members(user_id);

-- ============================================================================
-- 3. RLS on organizations
-- ============================================================================

alter table public.organizations enable row level security;

create policy "Org members can read their orgs"
  on public.organizations for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create orgs"
  on public.organizations for insert
  with check (auth.uid() is not null);

create policy "Org owners can update their orgs"
  on public.organizations for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
    )
  );

create policy "Org owners can delete their orgs"
  on public.organizations for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
    )
  );

-- ============================================================================
-- 4. RLS on org_members
-- ============================================================================

alter table public.org_members enable row level security;

create policy "Members can read their org members"
  on public.org_members for select
  using (
    exists (
      select 1 from public.org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
    )
  );

create policy "Org owners can add members"
  on public.org_members for insert
  with check (
    exists (
      select 1 from public.org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
        and my_membership.role = 'owner'
    )
  );

create policy "Org owners can remove members"
  on public.org_members for delete
  using (
    exists (
      select 1 from public.org_members as my_membership
      where my_membership.org_id = org_members.org_id
        and my_membership.user_id = auth.uid()
        and my_membership.role = 'owner'
    )
  );

-- ============================================================================
-- 5. Trigger: auto-add creator as owner on org INSERT
-- ============================================================================

create or replace function public.handle_new_org()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  return new;
end;
$$;

create trigger on_org_created
  after insert on public.organizations
  for each row execute function public.handle_new_org();

-- ============================================================================
-- 6. Trigger: auto-update updated_at on organizations UPDATE
-- ============================================================================

create or replace function public.update_organizations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger on_organizations_updated
  before update on public.organizations
  for each row execute function public.update_organizations_updated_at();

-- ============================================================================
-- 7. Migrate agents: user_id -> org_id
-- ============================================================================

-- 7a. Add nullable org_id column
alter table public.agents
  add column org_id uuid references public.organizations(id) on delete cascade;

-- 7b. Create a default org for each user who owns agents
insert into public.organizations (id, name, slug)
select
  gen_random_uuid(),
  coalesce(nullif(u.full_name, ''), u.email) || '''s Organization',
  u.id::text
from public.users u
where exists (
  select 1 from public.agents a where a.user_id = u.id
);

-- 7c. Insert the user as owner of their default org
-- (The trigger handles this automatically for new inserts, but the
--  bulk insert above uses a direct INSERT so we do it manually here
--  in case the trigger's auth.uid() returns null during migration.)
insert into public.org_members (org_id, user_id, role)
select o.id, u.id, 'owner'
from public.organizations o
join public.users u on o.slug = u.id::text
on conflict (org_id, user_id) do nothing;

-- 7d. Populate org_id on existing agents
update public.agents
set org_id = o.id
from public.organizations o
where o.slug = agents.user_id::text;

-- 7e. Make org_id NOT NULL
alter table public.agents
  alter column org_id set not null;

-- 7f. Drop old user_id column and its index
drop index if exists idx_agents_user_id;

alter table public.agents
  drop column user_id;

-- 7g. Add index on new org_id column
create index idx_agents_org_id on public.agents(org_id);

-- ============================================================================
-- 8. Update agents RLS policies from user_id to org membership
-- ============================================================================

drop policy if exists "Users can read their own agents" on public.agents;
drop policy if exists "Users can insert their own agents" on public.agents;
drop policy if exists "Users can update their own agents" on public.agents;
drop policy if exists "Users can delete their own agents" on public.agents;

create policy "Org members can read agents"
  on public.agents for select
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = agents.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Org members can create agents"
  on public.agents for insert
  with check (
    exists (
      select 1 from public.org_members
      where org_members.org_id = agents.org_id
        and org_members.user_id = auth.uid()
    )
  );

create policy "Org owners can update agents"
  on public.agents for update
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = agents.org_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
    )
  );

create policy "Org owners can delete agents"
  on public.agents for delete
  using (
    exists (
      select 1 from public.org_members
      where org_members.org_id = agents.org_id
        and org_members.user_id = auth.uid()
        and org_members.role = 'owner'
    )
  );

-- ============================================================================
-- 9. Storage bucket: org-avatars (public)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('org-avatars', 'org-avatars', true);

-- Public read access
create policy "Anyone can read org avatars"
  on storage.objects for select
  using (bucket_id = 'org-avatars');

-- Authenticated users can upload
create policy "Authenticated users can upload org avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'org-avatars'
    and auth.uid() is not null
  );

-- Authenticated users can update their uploads
create policy "Authenticated users can update org avatars"
  on storage.objects for update
  using (
    bucket_id = 'org-avatars'
    and auth.uid() is not null
  );

-- Authenticated users can delete
create policy "Authenticated users can delete org avatars"
  on storage.objects for delete
  using (
    bucket_id = 'org-avatars'
    and auth.uid() is not null
  );
