-- Per-file BCP-47 language hints, forwarded to Document AI's
-- `ocrConfig.hints.languageHints` when present.
ALTER TABLE public.rag_files ADD COLUMN language_hints text[];
