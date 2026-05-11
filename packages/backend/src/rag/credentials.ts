import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CREDENTIALS_FILENAME = 'openflow-gcp-credentials.json';
const FILE_MODE_OWNER_RW = 0o600;

/**
 * If GCP_CREDENTIALS_JSON is set, materialize it to a tmp file and point
 * GOOGLE_APPLICATION_CREDENTIALS at it so every Google SDK finds it via the
 * standard ADC path. The JSON is never written to the image or to git — it
 * comes from the platform's secret store as an env var at runtime.
 *
 * If GCP_CREDENTIALS_JSON is not set, do nothing — local dev relies on
 * `gcloud auth application-default login` for ADC.
 */
export function initRagCredentials(): void {
  const { env } = process;
  const { GCP_CREDENTIALS_JSON: raw } = env;
  if (typeof raw !== 'string' || raw === '') return;

  const path = join(tmpdir(), CREDENTIALS_FILENAME);
  writeFileSync(path, raw, { mode: FILE_MODE_OWNER_RW });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path;
  process.stdout.write('[startup] RAG credentials materialized from GCP_CREDENTIALS_JSON\n');
}
