const DEFAULT_EMBEDDINGS_RPM = 60;

export interface RagConfig {
  projectId: string;
  location: string;
  processorId: string;
  bucket: string;
  credentialsPath: string | undefined;
  embeddingsRpm: number;
}

interface OptionalRagConfig {
  config: RagConfig | null;
  missing: string[];
}

function pickEnv(name: string): string | undefined {
  const { env } = process;
  const { [name]: value } = env;
  if (typeof value !== 'string' || value === '') return undefined;
  return value;
}

export function readRagConfig(): OptionalRagConfig {
  const projectId = pickEnv('GCP_PROJECT_ID');
  const location = pickEnv('GCP_LOCATION') ?? 'us';
  const processorId = pickEnv('DOCUMENTAI_PROCESSOR_ID');
  const bucket = pickEnv('GCS_BUCKET');
  const credentialsPath = pickEnv('GOOGLE_APPLICATION_CREDENTIALS');
  const rpm = Number(pickEnv('EMBEDDINGS_RPM') ?? String(DEFAULT_EMBEDDINGS_RPM));

  const missing: string[] = [];
  if (projectId === undefined) missing.push('GCP_PROJECT_ID');
  if (processorId === undefined) missing.push('DOCUMENTAI_PROCESSOR_ID');
  if (bucket === undefined) missing.push('GCS_BUCKET');

  if (projectId === undefined || processorId === undefined || bucket === undefined) {
    return { config: null, missing };
  }
  return {
    config: { projectId, location, processorId, bucket, credentialsPath, embeddingsRpm: rpm },
    missing,
  };
}

export function requireRagConfig(): RagConfig {
  const { config, missing } = readRagConfig();
  if (config === null) {
    throw new Error(`RAG config missing env vars: ${missing.join(', ')}`);
  }
  return config;
}
