-- Atomic publish for agent-type apps
-- Assembles agent config + MCP servers into a JSONB snapshot

create or replace function public.publish_agent_version_tx(
  p_agent_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_version integer;
  v_staging_api_key_id uuid;
  v_app_type text;
  v_system_prompt text;
  v_max_steps integer;
  v_graph_data jsonb;
begin
  -- Verify the calling user is a member of the agent's org
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Lock the agent row
  select app_type, system_prompt, max_steps, staging_api_key_id
  into v_app_type, v_system_prompt, v_max_steps, v_staging_api_key_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_app_type is null or v_app_type <> 'agent' then
    raise exception 'NOT_AGENT_TYPE:%', p_agent_id;
  end if;

  -- Assemble agent config snapshot
  v_graph_data := jsonb_strip_nulls(jsonb_build_object(
    'appType', 'agent',
    'systemPrompt', coalesce(v_system_prompt, ''),
    'maxSteps', v_max_steps,
    'contextItems', coalesce(
      (select jsonb_agg(
        jsonb_build_object('sortOrder', ci.sort_order, 'content', ci.content)
        order by ci.sort_order
      ) from public.agent_context_items ci where ci.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'skills', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'name', sk.name,
          'description', sk.description,
          'content', sk.content,
          'repoUrl', sk.repo_url,
          'sortOrder', sk.sort_order
        )
        order by sk.sort_order
      ) from public.agent_skills sk where sk.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'mcpServers', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', m.server_id,
        'name', m.name,
        'transport', jsonb_build_object('type', m.transport_type) || m.transport_config,
        'enabled', m.enabled
      )) from public.graph_mcp_servers m where m.agent_id = p_agent_id),
      '[]'::jsonb
    )
  ));

  -- Atomically increment version
  update public.agents
  set current_version = coalesce(current_version, 0) + 1
  where id = p_agent_id
  returning current_version into v_new_version;

  -- Insert the version snapshot
  insert into public.agent_versions (agent_id, version, graph_data, published_by)
  values (p_agent_id, v_new_version, v_graph_data, auth.uid());

  -- Promote the production API key
  update public.agents
  set production_api_key_id = v_staging_api_key_id
  where id = p_agent_id;

  return v_new_version;
end;
$$;
