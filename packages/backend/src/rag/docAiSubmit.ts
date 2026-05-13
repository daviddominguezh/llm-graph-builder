import type { SupabaseClient } from '@supabase/supabase-js';

import { type RagFileRow, updateStatus } from '../db/queries/ragFilesQueries.js';
import { type OcrMode, submitBatch } from './documentAi.js';
import { readBytesObject, writeBytesObject } from './gcs.js';
import { derivePdfObjectPath, imageBytesToPdfBytes, isImageMime } from './imagePdf.js';

const PDF_MIME = 'application/pdf';
const GS_BUCKET_PREFIX_REGEX = /^gs:\/\/[^\/]+\//v;

function resolveOcrMode(value: string | null): OcrMode {
  return value === 'advanced' ? 'advanced' : 'standard';
}

async function prepareDocumentAiInput(
  gcsObject: string,
  mimeType: string
): Promise<{ inputObjectPath: string; mimeType: string }> {
  if (!isImageMime(mimeType)) {
    return { inputObjectPath: gcsObject, mimeType };
  }
  const imageBytes = await readBytesObject(gcsObject);
  const pdfBytes = await imageBytesToPdfBytes(imageBytes, mimeType);
  const pdfPath = derivePdfObjectPath(gcsObject);
  await writeBytesObject(pdfPath, pdfBytes, PDF_MIME);
  return { inputObjectPath: pdfPath, mimeType: PDF_MIME };
}

export async function submitDocAiAndRecord(
  supabase: SupabaseClient,
  file: RagFileRow,
  log: (msg: string) => void
): Promise<void> {
  const outputPrefix = `parsed/${file.id}/`;
  const mode = resolveOcrMode(file.ocr_mode);
  const languageHints = mode === 'standard' ? file.language_hints : null;
  log(
    `submitAndRecord: file=${file.id} mode=${mode} mime=${file.mime_type} hints=${JSON.stringify(languageHints ?? [])}`
  );
  const prepared = await prepareDocumentAiInput(file.gcs_object, file.mime_type);
  const { operationName, outputGcsUri } = await submitBatch({
    inputObjectPath: prepared.inputObjectPath,
    outputPrefix,
    mimeType: prepared.mimeType,
    mode,
    languageHints,
  });
  log(`submitAndRecord: file=${file.id} op=${operationName} output=${outputGcsUri}`);
  await updateStatus(supabase, file.id, {
    status: 'parsing',
    da_operation: operationName,
    parsed_uri: outputGcsUri.replace(GS_BUCKET_PREFIX_REGEX, ''),
  });
}
