-- ============================================================================
-- Fix lossy rollback_to_snapshot_tx
--
-- The original function (20260310100000) predates several schema additions
-- and silently dropped data every time a failed operation batch triggered a
-- rollback:
--   * graph_nodes.output_schema_id (added 20260311200000 / 20260312000000)
--   * graph_nodes.output_prompt    (added 20260313000000)
--   * graph_edge_preconditions.provider_type / provider_id / tool_name
--     (added 20260428100000; the read path falls back to parsing `value`,
--     but only for tool_call rows whose value still holds the JSON bridge)
--   * graph_mcp_servers.library_item_id / variable_values (added 20260314000000)
--   * graph_output_schemas were never cleared nor restored, so a failed batch
--     containing output-schema ops left them partially applied.
--
-- This migration recreates the function to restore every field captured in
-- the snapshot (assembleGraph output), so a rollback returns the graph to
-- exactly its pre-batch state.
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
  v_schema jsonb;
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
  delete from public.graph_output_schemas where agent_id = p_agent_id;

  -- 2. Insert output schemas (before nodes, which reference them by id)
  if p_snapshot->'outputSchemas' is not null then
    for v_schema in select * from jsonb_array_elements(p_snapshot->'outputSchemas')
    loop
      insert into public.graph_output_schemas (agent_id, schema_id, name, fields)
      values (
        p_agent_id,
        v_schema->>'id',
        coalesce(v_schema->>'name', ''),
        coalesce(v_schema->'fields', '[]'::jsonb)
      );
    end loop;
  end if;

  -- 3. Insert nodes (now including output_schema_id / output_prompt)
  for v_node in select * from jsonb_array_elements(p_snapshot->'nodes')
  loop
    insert into public.graph_nodes (
      agent_id, node_id, text, kind, description, agent,
      next_node_is_user, fallback_node_id, "global", default_fallback,
      position_x, position_y, output_schema_id, output_prompt
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
      (v_node->'position'->>'y')::double precision,
      v_node->>'outputSchemaId',
      v_node->>'outputPrompt'
    );
  end loop;

  -- 4. Insert edges + preconditions (now including structured tool refs)
  for v_edge in select * from jsonb_array_elements(p_snapshot->'edges')
  loop
    insert into public.graph_edges (agent_id, from_node, to_node)
    values (p_agent_id, v_edge->>'from', v_edge->>'to')
    returning id into v_edge_id;

    if v_edge->'preconditions' is not null then
      for v_precondition in select * from jsonb_array_elements(v_edge->'preconditions')
      loop
        insert into public.graph_edge_preconditions (
          edge_id, type, value, description, tool_fields,
          provider_type, provider_id, tool_name
        ) values (
          v_edge_id,
          v_precondition->>'type',
          coalesce(
            v_precondition->>'value',
            case
              when v_precondition->>'type' = 'tool_call' and v_precondition ? 'tool'
                then (v_precondition->'tool')::text
              else ''
            end
          ),
          coalesce(v_precondition->>'description', ''),
          v_precondition->'toolFields',
          case
            when v_precondition->>'type' = 'tool_call' and v_precondition ? 'tool'
              then v_precondition->'tool'->>'providerType'
            else null
          end,
          case
            when v_precondition->>'type' = 'tool_call' and v_precondition ? 'tool'
              then v_precondition->'tool'->>'providerId'
            else null
          end,
          case
            when v_precondition->>'type' = 'tool_call' and v_precondition ? 'tool'
              then v_precondition->'tool'->>'toolName'
            else null
          end
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

  -- 5. Insert agents
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

  -- 6. Insert MCP servers (now including library_item_id / variable_values)
  if p_snapshot->'mcpServers' is not null then
    for v_server in select * from jsonb_array_elements(p_snapshot->'mcpServers')
    loop
      insert into public.graph_mcp_servers (
        agent_id, server_id, name, transport_type, transport_config, enabled,
        library_item_id, variable_values
      ) values (
        p_agent_id,
        v_server->>'id',
        v_server->>'name',
        v_server->'transport'->>'type',
        v_server->'transport' - 'type',
        coalesce((v_server->>'enabled')::boolean, true),
        v_server->>'libraryItemId',
        v_server->'variableValues'
      );
    end loop;
  end if;

  -- 7. Restore start node
  update public.agents
  set start_node = coalesce(p_snapshot->>'startNode', start_node)
  where id = p_agent_id;
end;
$$;
