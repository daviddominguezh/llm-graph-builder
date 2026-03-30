-- Reorder context items by reassigning sort_order values
-- p_sort_orders is an array of the current sort_order values in new order

create or replace function public.reorder_context_items(
  p_agent_id uuid,
  p_sort_orders integer[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_idx integer;
  v_old_order integer;
begin
  -- Verify org membership
  if not exists (
    select 1
    from public.agents a
    join public.org_members om on om.org_id = a.org_id
    where a.id = p_agent_id and om.user_id = auth.uid()
  ) then
    raise exception 'AGENT_NOT_FOUND:%', p_agent_id;
  end if;

  -- Use negative temporary values to avoid unique constraint violations
  for v_idx in 1..array_length(p_sort_orders, 1) loop
    v_old_order := p_sort_orders[v_idx];
    update public.agent_context_items
    set sort_order = -v_idx
    where agent_id = p_agent_id and sort_order = v_old_order;
  end loop;

  -- Now set final values
  for v_idx in 1..array_length(p_sort_orders, 1) loop
    update public.agent_context_items
    set sort_order = v_idx - 1
    where agent_id = p_agent_id and sort_order = -v_idx;
  end loop;
end;
$$;
