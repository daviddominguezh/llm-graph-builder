const DEFAULT_EMBEDDINGS_RPM = 60;

export interface RagConfig {
  projectId: string;
  location: string;
  ocrProcessorId: string;
  layoutProcessorId: string;
  bucket: string;
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

interface RawEnv {
  projectId: string | undefined;
  location: string;
  ocrProcessorId: string | undefined;
  layoutProcessorId: string | undefined;
  bucket: string | undefined;
  embeddingsRpm: number;
}

function readEnv(): RawEnv {
  return {
    projectId: pickEnv('GCP_PROJECT_ID'),
    location: pickEnv('GCP_LOCATION') ?? 'us',
    ocrProcessorId: pickEnv('DOCUMENTAI_OCR_PROCESSOR_ID'),
    layoutProcessorId: pickEnv('DOCUMENTAI_LAYOUT_PROCESSOR_ID'),
    bucket: pickEnv('GCS_BUCKET'),
    embeddingsRpm: Number(pickEnv('EMBEDDINGS_RPM') ?? String(DEFAULT_EMBEDDINGS_RPM)),
  };
}

function collectMissing(env: RawEnv): string[] {
  const missing: string[] = [];
  if (env.projectId === undefined) missing.push('GCP_PROJECT_ID');
  if (env.ocrProcessorId === undefined) missing.push('DOCUMENTAI_OCR_PROCESSOR_ID');
  if (env.layoutProcessorId === undefined) missing.push('DOCUMENTAI_LAYOUT_PROCESSOR_ID');
  if (env.bucket === undefined) missing.push('GCS_BUCKET');
  return missing;
}

export function readRagConfig(): OptionalRagConfig {
  const env = readEnv();
  const missing = collectMissing(env);
  if (
    env.projectId === undefined ||
    env.ocrProcessorId === undefined ||
    env.layoutProcessorId === undefined ||
    env.bucket === undefined
  ) {
    return { config: null, missing };
  }
  return {
    config: {
      projectId: env.projectId,
      location: env.location,
      ocrProcessorId: env.ocrProcessorId,
      layoutProcessorId: env.layoutProcessorId,
      bucket: env.bucket,
      embeddingsRpm: env.embeddingsRpm,
    },
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
