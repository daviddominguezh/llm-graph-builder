-- ============================================================================
-- Atomic publish: increment version + insert snapshot in one transaction
-- ============================================================================

create or replace function public.publish_version_tx(
  p_agent_id uuid,
  p_graph_data jsonb,
  p_user_id uuid
) returns integer
language plpgsql
security invoker
as $$
declare
  v_new_version integer;
  v_staging_api_key_id uuid;
begin
  -- Atomically increment version and get the staging API key
  update public.agents
  set current_version = coalesce(current_version, 0) + 1
  where id = p_agent_id
  returning current_version, staging_api_key_id
  into v_new_version, v_staging_api_key_id;

  if v_new_version is null then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Insert the version snapshot
  insert into public.agent_versions (agent_id, version, graph_data, published_by)
  values (p_agent_id, v_new_version, p_graph_data, p_user_id);

  -- Promote the production API key
  update public.agents
  set production_api_key_id = v_staging_api_key_id
  where id = p_agent_id;

  return v_new_version;
end;
$$;
