import { GoogleAuth } from 'google-auth-library';

import { requireRagConfig } from './config.js';

const MODEL_ID = 'semantic-ranker-default-004';
const RERANK_LOCATION = 'global';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const HTTP_OK = 200;

export interface RerankInputRecord {
  id: string;
  content: string;
}

export interface RerankedRecord {
  id: string;
  score: number;
}

export interface RerankInput {
  query: string;
  records: RerankInputRecord[];
  topN: number;
}

interface RerankResponseRecord {
  id?: unknown;
  score?: unknown;
}

interface RerankResponse {
  records?: RerankResponseRecord[];
}

let cachedAuth: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  cachedAuth ??= new GoogleAuth({ scopes: [SCOPE] });
  return cachedAuth;
}

function endpointUrl(projectId: string): string {
  return `https://discoveryengine.googleapis.com/v1/projects/${projectId}/locations/${RERANK_LOCATION}/rankingConfigs/default_ranking_config:rank`;
}

function isResponseShape(v: unknown): v is RerankResponse {
  return typeof v === 'object' && v !== null;
}

function mapResponse(data: unknown): RerankedRecord[] {
  if (!isResponseShape(data)) return [];
  const records = data.records ?? [];
  const out: RerankedRecord[] = [];
  for (const r of records) {
    if (typeof r.id !== 'string' || typeof r.score !== 'number') continue;
    out.push({ id: r.id, score: r.score });
  }
  return out;
}

export async function rerankRecords(input: RerankInput): Promise<RerankedRecord[]> {
  const cfg = requireRagConfig();
  const client = await getAuth().getClient();
  const res = await client.request({
    url: endpointUrl(cfg.projectId),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      model: MODEL_ID,
      query: input.query,
      topN: input.topN,
      records: input.records,
    },
  });
  if (res.status !== HTTP_OK) {
    throw new Error(`rerank failed: HTTP ${String(res.status)}`);
  }
  return mapResponse(res.data);
}
