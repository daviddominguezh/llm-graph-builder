ALTER TABLE public.agents
  ADD CONSTRAINT agents_slug_format
  CHECK (length(slug) <= 40 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
