-- ============================================================================
-- Atomic edge upsert: upsert edge + replace preconditions in one transaction.
-- Closes the race window where concurrent insertEdge calls for the same
-- (agent_id, from_node, to_node) could corrupt preconditions.
-- ============================================================================

create or replace function public.upsert_edge_tx(
  p_agent_id uuid,
  p_from_node text,
  p_to_node text,
  p_preconditions jsonb default '[]'::jsonb,
  p_context_preconditions jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edge_id uuid;
begin
  -- Upsert the edge row
  insert into public.graph_edges (agent_id, from_node, to_node)
  values (p_agent_id, p_from_node, p_to_node)
  on conflict (agent_id, from_node, to_node) do update set from_node = excluded.from_node
  returning id into v_edge_id;

  -- Delete existing preconditions
  delete from public.graph_edge_preconditions where edge_id = v_edge_id;
  delete from public.graph_edge_context_preconditions where edge_id = v_edge_id;

  -- Insert new preconditions
  if jsonb_array_length(p_preconditions) > 0 then
    insert into public.graph_edge_preconditions (edge_id, type, value, description, tool_fields)
    select
      v_edge_id,
      (elem->>'type')::text,
      (elem->>'value')::text,
      (elem->>'description')::text,
      case when elem ? 'toolFields' then (elem->'toolFields') else null end
    from jsonb_array_elements(p_preconditions) as elem;
  end if;

  -- Insert context preconditions if provided
  if p_context_preconditions is not null then
    insert into public.graph_edge_context_preconditions (edge_id, preconditions, jump_to)
    values (
      v_edge_id,
      array(select jsonb_array_elements_text(p_context_preconditions->'preconditions')),
      (p_context_preconditions->>'jumpTo')::text
    );
  end if;

  return v_edge_id;
end;
$$;
