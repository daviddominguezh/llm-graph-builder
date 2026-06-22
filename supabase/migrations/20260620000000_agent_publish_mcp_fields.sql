-- Widen publish_agent_version_tx so the agent snapshot's mcpServers carry
-- libraryItemId + variableValues (parity with publish_version_tx). Needed so
-- agent runs resolve {{placeholder}} transports and library/OAuth MCPs.
-- NOTE: this mcpServers jsonb_build_object is duplicated in publish_version_tx
--   (20260618000000). Keep both in sync — SP4 (per-tenant MCP) edits both.
-- (Function body copied verbatim; only the mcpServers block changed.)
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
  v_selected_tools jsonb;
  v_selected_kv_store_id uuid;
  v_selected_rag_store_id uuid;
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

  -- Lock the agent row (serializes concurrent PATCH /selected-tools,
  -- PATCH /store-bindings, and other publish attempts).
  select app_type, system_prompt, max_steps, staging_api_key_id,
         selected_tools, selected_kv_store_id, selected_rag_store_id
  into v_app_type, v_system_prompt, v_max_steps, v_staging_api_key_id,
       v_selected_tools, v_selected_kv_store_id, v_selected_rag_store_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_app_type is null or v_app_type <> 'agent' then
    raise exception 'NOT_AGENT_TYPE:%', p_agent_id;
  end if;

  -- Lock referenced store rows so a concurrent delete cannot win the race.
  if v_selected_kv_store_id is not null then
    perform 1 from public.kv_stores where id = v_selected_kv_store_id for share;
  end if;
  if v_selected_rag_store_id is not null then
    perform 1 from public.rag_stores where id = v_selected_rag_store_id for share;
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
        'enabled', m.enabled,
        'libraryItemId', m.library_item_id,
        'variableValues', m.variable_values
      )) from public.graph_mcp_servers m where m.agent_id = p_agent_id),
      '[]'::jsonb
    )
  ));

  -- Atomically increment version
  update public.agents
  set current_version = coalesce(current_version, 0) + 1
  where id = p_agent_id
  returning current_version into v_new_version;

  -- Insert the version snapshot, including selected_tools + store bindings.
  insert into public.agent_versions (
    agent_id, version, graph_data, published_by,
    selected_tools, selected_kv_store_id, selected_rag_store_id
  )
  values (
    p_agent_id, v_new_version, v_graph_data, auth.uid(),
    coalesce(v_selected_tools, '[]'::jsonb),
    v_selected_kv_store_id,
    v_selected_rag_store_id
  );

  -- Promote the production API key
  update public.agents
  set production_api_key_id = v_staging_api_key_id
  where id = p_agent_id;

  return v_new_version;
end;
$$;
