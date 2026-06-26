-- 20260617000000_agent_store_bindings_and_snapshots.sql
-- Per-agent KV/RAG store bindings on agents (draft) and agent_versions (snapshot).
-- Also adds selected_tools snapshot to agent_versions to fix the tool-versioning bug.

ALTER TABLE public.agents
  ADD COLUMN selected_kv_store_id  UUID NULL REFERENCES public.kv_stores(id)  ON DELETE RESTRICT,
  ADD COLUMN selected_rag_store_id UUID NULL REFERENCES public.rag_stores(id) ON DELETE RESTRICT;

ALTER TABLE public.agent_versions
  ADD COLUMN selected_tools         JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN selected_kv_store_id   UUID NULL,
  ADD COLUMN selected_rag_store_id  UUID NULL;

CREATE INDEX idx_agents_selected_kv_store_id  ON public.agents (selected_kv_store_id) WHERE selected_kv_store_id IS NOT NULL;
CREATE INDEX idx_agents_selected_rag_store_id ON public.agents (selected_rag_store_id) WHERE selected_rag_store_id IS NOT NULL;
CREATE INDEX idx_agent_versions_selected_kv_store_id  ON public.agent_versions (selected_kv_store_id) WHERE selected_kv_store_id IS NOT NULL;
CREATE INDEX idx_agent_versions_selected_rag_store_id ON public.agent_versions (selected_rag_store_id) WHERE selected_rag_store_id IS NOT NULL;

-- Backfill: copy current agents.selected_tools into the LATEST published version row only.
-- Older historical versions keep the default '[]'::jsonb so a replay fails closed
-- rather than silently inheriting a different tool set than was live at publish time.
UPDATE public.agent_versions av
SET selected_tools = a.selected_tools
FROM public.agents a
WHERE av.agent_id = a.id
  AND av.version = a.current_version;
