-- Add output_prompt column to graph_nodes
alter table public.graph_nodes add column output_prompt text;

-- Drop and recreate publish_version_tx to include output_prompt
drop function if exists public.publish_version_tx(uuid);

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
begin
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  select start_node, staging_api_key_id
  into v_start_node, v_staging_api_key_id
  from public.agents
  where id = p_agent_id
  for update;

  if v_start_node is null then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

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
        'outputSchema', (
          select os.fields
          from public.graph_output_schemas os
          where os.agent_id = p_agent_id and os.schema_id = n.output_schema_id
        ),
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
        'enabled', m.enabled
      ))
      from public.graph_mcp_servers m where m.agent_id = p_agent_id
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

  update public.agents
  set current_version = coalesce(current_version, 0) + 1
  where id = p_agent_id
  returning current_version into v_new_version;

  insert into public.agent_versions (agent_id, version, graph_data, published_by)
  values (p_agent_id, v_new_version, v_graph_data, auth.uid());

  update public.agents
  set production_api_key_id = v_staging_api_key_id
  where id = p_agent_id;

  return v_new_version;
end;
$$;
