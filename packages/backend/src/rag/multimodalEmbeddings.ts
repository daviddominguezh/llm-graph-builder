import { GoogleAuth } from 'google-auth-library';

import { requireRagConfig } from './config.js';

const MODEL_ID = 'multimodalembedding@001';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const HTTP_OK = 200;
const DEFAULT_LOCATION = 'us-central1';
const DIMENSION = 1408;
const FIRST_PREDICTION = 0;

let cachedAuth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  cachedAuth ??= new GoogleAuth({ scopes: [SCOPE] });
  return cachedAuth;
}

function endpointUrl(): string {
  const cfg = requireRagConfig();
  const location = cfg.location === 'us' || cfg.location === 'global' ? DEFAULT_LOCATION : cfg.location;
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${cfg.projectId}/locations/${location}/publishers/google/models/${MODEL_ID}:predict`;
}

interface PredictionShape {
  textEmbedding?: unknown;
  imageEmbedding?: unknown;
}

interface PredictResponse {
  predictions?: PredictionShape[];
}

function isResponseShape(v: unknown): v is PredictResponse {
  return typeof v === 'object' && v !== null;
}

function toVector(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number');
}

interface PredictRequest {
  instances: Array<{ text?: string; image?: { bytesBase64Encoded?: string; gcsUri?: string } }>;
  parameters?: { dimension?: number };
}

async function callPredict(body: PredictRequest): Promise<PredictionShape | null> {
  const client = await getAuth().getClient();
  const res = await client.request({
    url: endpointUrl(),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  });
  if (res.status !== HTTP_OK) {
    throw new Error(`multimodal embedding failed: HTTP ${String(res.status)}`);
  }
  if (!isResponseShape(res.data)) return null;
  return res.data.predictions?.[FIRST_PREDICTION] ?? null;
}

export async function embedImageBytes(bytes: Uint8Array): Promise<number[]> {
  const base64 = Buffer.from(bytes).toString('base64');
  const prediction = await callPredict({
    instances: [{ image: { bytesBase64Encoded: base64 } }],
    parameters: { dimension: DIMENSION },
  });
  return toVector(prediction?.imageEmbedding);
}

export async function embedImageFromGcs(gcsUri: string): Promise<number[]> {
  const prediction = await callPredict({
    instances: [{ image: { gcsUri } }],
    parameters: { dimension: DIMENSION },
  });
  return toVector(prediction?.imageEmbedding);
}

export async function embedQueryMultimodal(text: string): Promise<number[]> {
  const prediction = await callPredict({
    instances: [{ text }],
    parameters: { dimension: DIMENSION },
  });
  return toVector(prediction?.textEmbedding);
}
