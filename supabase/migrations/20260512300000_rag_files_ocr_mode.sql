-- Per-file OCR mode: 'standard' (Document OCR) vs 'advanced' (Layout Parser).
-- NULL means OCR was disabled at upload time (future: skip DA entirely).
ALTER TABLE public.rag_files
  ADD COLUMN ocr_mode text NULL
  CHECK (ocr_mode IS NULL OR ocr_mode IN ('standard', 'advanced'));
