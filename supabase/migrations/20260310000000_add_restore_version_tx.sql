-- ============================================================================
-- Atomic version restore: wraps clear + hydrate in a single transaction
-- ============================================================================

create or replace function public.restore_version_tx(
  p_agent_id uuid,
  p_version integer
) returns jsonb
language plpgsql
security invoker
as $$
declare
  v_snapshot jsonb;
  v_start_node text;
  v_node jsonb;
  v_edge jsonb;
  v_agent jsonb;
  v_server jsonb;
  v_edge_id uuid;
  v_precondition jsonb;
  v_ctx jsonb;
begin
  -- 1. Fetch snapshot
  select graph_data into v_snapshot
  from public.agent_versions
  where agent_id = p_agent_id and version = p_version;

  if v_snapshot is null then
    raise exception 'VERSION_NOT_FOUND:%', p_version;
  end if;

  v_start_node := v_snapshot->>'startNode';

  -- 2. Clear staging data (order matters for FK constraints)
  delete from public.graph_context_presets where agent_id = p_agent_id;
  delete from public.graph_mcp_servers where agent_id = p_agent_id;
  delete from public.graph_agents where agent_id = p_agent_id;
  delete from public.graph_edges where agent_id = p_agent_id;
  delete from public.graph_nodes where agent_id = p_agent_id;

  -- 3. Insert nodes
  for v_node in select * from jsonb_array_elements(v_snapshot->'nodes')
  loop
    insert into public.graph_nodes (
      agent_id, node_id, text, kind, description, agent,
      next_node_is_user, fallback_node_id, "global", default_fallback,
      position_x, position_y
    ) values (
      p_agent_id,
      v_node->>'id',
      coalesce(v_node->>'text', ''),
      coalesce(v_node->>'kind', 'agent'),
      coalesce(v_node->>'description', ''),
      v_node->>'agent',
      (v_node->>'nextNodeIsUser')::boolean,
      v_node->>'fallbackNodeId',
      coalesce((v_node->>'global')::boolean, false),
      (v_node->>'defaultFallback')::boolean,
      (v_node->'position'->>'x')::double precision,
      (v_node->'position'->>'y')::double precision
    );
  end loop;

  -- 4. Insert edges + preconditions
  for v_edge in select * from jsonb_array_elements(v_snapshot->'edges')
  loop
    insert into public.graph_edges (agent_id, from_node, to_node)
    values (p_agent_id, v_edge->>'from', v_edge->>'to')
    returning id into v_edge_id;

    -- Insert preconditions
    if v_edge->'preconditions' is not null then
      for v_precondition in select * from jsonb_array_elements(v_edge->'preconditions')
      loop
        insert into public.graph_edge_preconditions (
          edge_id, type, value, description, tool_fields
        ) values (
          v_edge_id,
          v_precondition->>'type',
          v_precondition->>'value',
          coalesce(v_precondition->>'description', ''),
          v_precondition->'toolFields'
        );
      end loop;
    end if;

    -- Insert context preconditions
    if v_edge->'contextPreconditions' is not null then
      v_ctx := v_edge->'contextPreconditions';
      insert into public.graph_edge_context_preconditions (
        edge_id, preconditions, jump_to
      ) values (
        v_edge_id,
        array(select jsonb_array_elements_text(v_ctx->'preconditions')),
        v_ctx->>'jumpTo'
      );
    end if;
  end loop;

  -- 5. Insert agents
  if v_snapshot->'agents' is not null then
    for v_agent in select * from jsonb_array_elements(v_snapshot->'agents')
    loop
      insert into public.graph_agents (agent_id, agent_key, description)
      values (
        p_agent_id,
        v_agent->>'id',
        coalesce(v_agent->>'description', '')
      );
    end loop;
  end if;

  -- 6. Insert MCP servers
  if v_snapshot->'mcpServers' is not null then
    for v_server in select * from jsonb_array_elements(v_snapshot->'mcpServers')
    loop
      insert into public.graph_mcp_servers (
        agent_id, server_id, name, transport_type, transport_config, enabled
      ) values (
        p_agent_id,
        v_server->>'id',
        v_server->>'name',
        v_server->'transport'->>'type',
        v_server->'transport' - 'type',
        coalesce((v_server->>'enabled')::boolean, true)
      );
    end loop;
  end if;

  -- 7. Update agent metadata
  update public.agents
  set start_node = v_start_node,
      current_version = p_version
  where id = p_agent_id;

  return v_snapshot;
end;
$$;
