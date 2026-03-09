-- ============================================================================
-- 1. Fix storage policies: restrict avatar operations to org members
-- ============================================================================

drop policy if exists "Authenticated users can upload org avatars" on storage.objects;
create policy "Org members can upload org avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'org-avatars'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Authenticated users can update org avatars" on storage.objects;
create policy "Org members can update org avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'org-avatars'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Authenticated users can delete org avatars" on storage.objects;
create policy "Org members can delete org avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'org-avatars'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

-- ============================================================================
-- 2. Atomic publish: RPC function to promote staging to production
-- ============================================================================

create or replace function public.publish_agent(agent_id uuid)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  new_version integer;
  v_org_id uuid;
begin
  -- Verify the caller is a member of the agent's org
  select org_id into v_org_id from public.agents where id = agent_id;
  if v_org_id is null then
    raise exception 'Agent not found';
  end if;
  if not public.is_org_member(v_org_id) then
    raise exception 'Not authorized to publish this agent';
  end if;

  update public.agents
  set
    graph_data_production = graph_data_staging,
    production_api_key_id = staging_api_key_id,
    version = version + 1
  where id = agent_id
  returning version into new_version;

  if new_version is null then
    raise exception 'Agent not found or update failed';
  end if;

  return new_version;
end;
$$;

-- ============================================================================
-- 3. API key preview column
-- ============================================================================

alter table public.org_api_keys
  add column key_preview text not null default '';

update public.org_api_keys
  set key_preview = '••••••••' || right(key_value, 4);

create or replace function public.set_api_key_preview()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.key_preview := '••••••••' || right(new.key_value, 4);
  return new;
end;
$$;

create trigger on_api_key_insert
  before insert or update of key_value on public.org_api_keys
  for each row execute function public.set_api_key_preview();
