-- Add 'plain' to the ocr_mode CHECK constraint so we can mark files that bypass
-- Document AI entirely and are extracted locally (txt, md, csv, json today;
-- future: pdf/docx/etc. with OCR off via pdfjs/officeparser/turndown).
ALTER TABLE public.rag_files
  DROP CONSTRAINT IF EXISTS rag_files_ocr_mode_check;

ALTER TABLE public.rag_files
  ADD CONSTRAINT rag_files_ocr_mode_check
  CHECK (ocr_mode IS NULL OR ocr_mode IN ('standard', 'advanced', 'plain'));
