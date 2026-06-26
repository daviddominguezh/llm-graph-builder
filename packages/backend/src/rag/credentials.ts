import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CREDENTIALS_FILENAME = 'gcp-credentials.json';
const FILE_MODE_OWNER_RW = 0o600;
const BASE64_UTF8 = 'utf8';

/**
 * If GCP_CREDENTIALS_JSON_B64 is set, decode it (base64) and materialize the
 * JSON to a tmp file, then point GOOGLE_APPLICATION_CREDENTIALS at it so every
 * Google SDK finds it via the standard ADC path. Base64 keeps the value on a
 * single line in .env / secret stores and avoids any newline-escape pitfalls
 * in the service-account key's private_key field.
 *
 * If the var is not set, do nothing — local dev without this var falls back
 * to `gcloud auth application-default login` for ADC.
 */
export function initRagCredentials(): void {
  const { env } = process;
  const { GCP_CREDENTIALS_JSON_B64: encoded } = env;
  if (typeof encoded !== 'string' || encoded === '') return;

  const decoded = Buffer.from(encoded, 'base64').toString(BASE64_UTF8);
  const path = join(tmpdir(), CREDENTIALS_FILENAME);
  writeFileSync(path, decoded, { mode: FILE_MODE_OWNER_RW });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
  process.stdout.write('[startup] RAG credentials materialized from GCP_CREDENTIALS_JSON_B64\n');
}
