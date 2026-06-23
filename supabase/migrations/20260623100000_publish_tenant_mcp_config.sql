-- SP4: snapshot per-tenant MCP config at publish time.
--
-- Redefines BOTH publish RPCs (publish_version_tx for workflows,
-- publish_agent_version_tx for agents) so each version's graph_data carries a
-- new 'mcpTenantConfig' array: { serverId, tenantId, variableValues } for every
-- per-tenant config row of the agent. Runtime reads only this snapshot, keyed by
-- (server_id, tenantID).
--
-- The agent RPC's mcpServers block already embeds libraryItemId + variableValues
-- (fixed in 20260620000000); both blocks are kept in sync here. Bodies are copied
-- verbatim from 20260618000000 (workflow) and 20260620000000 (agent); only the
-- new 'mcpTenantConfig' sibling key is added to each v_graph_data object.

create or replace function public.publish_version_tx(
  p_agent_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_version integer;
  v_staging_api_key_id uuid;
  v_start_node text;
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

  -- Lock the agent row to serialize concurrent writes (PATCH /selected-tools,
  -- PATCH /store-bindings, other publish attempts).
  select start_node, staging_api_key_id, selected_tools,
         selected_kv_store_id, selected_rag_store_id
  into v_start_node, v_staging_api_key_id, v_selected_tools,
       v_selected_kv_store_id, v_selected_rag_store_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_start_node is null then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Lock referenced store rows so a concurrent DELETE cannot win the race against
  -- the snapshot. Only locks when the binding is non-null. perform discards results.
  if v_selected_kv_store_id is not null then
    perform 1 from public.kv_stores where id = v_selected_kv_store_id for share;
  end if;
  if v_selected_rag_store_id is not null then
    perform 1 from public.rag_stores where id = v_selected_rag_store_id for share;
  end if;

  -- Assemble graph data from staging tables within the transaction
  v_graph_data := jsonb_strip_nulls(jsonb_build_object(
    'startNode', v_start_node,
    'nodes', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', n.node_id,
        'text', n.text,
        'kind', n.kind,
        'description', n.description,
        'agent', n.agent,
        'nextNodeIsUser', n.next_node_is_user,
        'fallbackNodeId', n.fallback_node_id,
        'global', n.global,
        'defaultFallback', n.default_fallback,
        'outputSchemaId', n.output_schema_id,
        'outputPrompt', n.output_prompt,
        'position', case
          when n.position_x is not null and n.position_y is not null
          then jsonb_build_object('x', n.position_x, 'y', n.position_y)
        end
      )) from public.graph_nodes n where n.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'edges', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'from', e.from_node,
        'to', e.to_node,
        'preconditions', (
          select jsonb_agg(jsonb_build_object(
            'type', p.type,
            'value', p.value,
            'description', p.description,
            'toolFields', p.tool_fields
          ))
          from public.graph_edge_preconditions p
          where p.edge_id = e.id
        ),
        'contextPreconditions', (
          select jsonb_build_object(
            'preconditions', cp.preconditions,
            'jumpTo', cp.jump_to
          )
          from public.graph_edge_context_preconditions cp
          where cp.edge_id = e.id
          limit 1
        )
      )) from public.graph_edges e where e.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'agents', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', a.agent_key,
        'description', a.description
      )) from public.graph_agents a where a.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'mcpServers', (
      select jsonb_agg(jsonb_build_object(
        'id', m.server_id,
        'name', m.name,
        'transport', jsonb_build_object('type', m.transport_type) || m.transport_config,
        'enabled', m.enabled,
        'libraryItemId', m.library_item_id,
        'variableValues', m.variable_values
      ))
      from public.graph_mcp_servers m where m.agent_id = p_agent_id
    ),
    'mcpTenantConfig', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'serverId', c.server_id,
        'tenantId', c.tenant_id,
        'variableValues', c.variable_values
      )) from public.graph_mcp_server_tenant_config c where c.agent_id = p_agent_id),
      '[]'::jsonb
    ),
    'outputSchemas', (
      select jsonb_agg(jsonb_build_object(
        'id', os.schema_id,
        'name', os.name,
        'fields', os.fields
      ))
      from public.graph_output_schemas os where os.agent_id = p_agent_id
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
    ),
    'mcpTenantConfig', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'serverId', c.server_id,
        'tenantId', c.tenant_id,
        'variableValues', c.variable_values
      )) from public.graph_mcp_server_tenant_config c where c.agent_id = p_agent_id),
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
