-- ============================================================================
-- Atomic rollback: wraps clear + hydrate from an in-memory snapshot
-- ============================================================================

create or replace function public.rollback_to_snapshot_tx(
  p_agent_id uuid,
  p_snapshot jsonb
) returns void
language plpgsql
security invoker
as $$
declare
  v_node jsonb;
  v_edge jsonb;
  v_agent jsonb;
  v_server jsonb;
  v_edge_id uuid;
  v_precondition jsonb;
  v_ctx jsonb;
begin
  -- 1. Clear staging data (order matters for FK constraints)
  -- Note: graph_context_presets are intentionally NOT deleted here because
  -- they are not included in snapshots and cannot be restored.
  delete from public.graph_mcp_servers where agent_id = p_agent_id;
  delete from public.graph_agents where agent_id = p_agent_id;
  delete from public.graph_edges where agent_id = p_agent_id;
  delete from public.graph_nodes where agent_id = p_agent_id;

  -- 2. Insert nodes
  for v_node in select * from jsonb_array_elements(p_snapshot->'nodes')
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

  -- 3. Insert edges + preconditions
  for v_edge in select * from jsonb_array_elements(p_snapshot->'edges')
  loop
    insert into public.graph_edges (agent_id, from_node, to_node)
    values (p_agent_id, v_edge->>'from', v_edge->>'to')
    returning id into v_edge_id;

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

  -- 4. Insert agents
  if p_snapshot->'agents' is not null then
    for v_agent in select * from jsonb_array_elements(p_snapshot->'agents')
    loop
      insert into public.graph_agents (agent_id, agent_key, description)
      values (
        p_agent_id,
        v_agent->>'id',
        coalesce(v_agent->>'description', '')
      );
    end loop;
  end if;

  -- 5. Insert MCP servers
  if p_snapshot->'mcpServers' is not null then
    for v_server in select * from jsonb_array_elements(p_snapshot->'mcpServers')
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

  -- 6. Restore start node
  update public.agents
  set start_node = coalesce(p_snapshot->>'startNode', start_node)
  where id = p_agent_id;
end;
$$;
