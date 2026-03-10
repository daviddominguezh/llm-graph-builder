-- Add tool_fields JSONB column to graph_edge_preconditions
-- Stores per-field configuration for tool_call preconditions.
-- Each key is a field name, value is { type: 'fixed', value: string } or { type: 'reference', nodeId: string, path: string }.
alter table public.graph_edge_preconditions
  add column tool_fields jsonb;
