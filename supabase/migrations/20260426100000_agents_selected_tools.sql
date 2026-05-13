-- Adds per-agent tool selection storage. Default: empty array (zero tools).
-- Shape: [{ providerType: 'builtin' | 'mcp', providerId: string, toolName: string }, ...]

ALTER TABLE public.agents
  ADD COLUMN selected_tools jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.agents
  ADD CONSTRAINT selected_tools_is_array
  CHECK (jsonb_typeof(selected_tools) = 'array');
