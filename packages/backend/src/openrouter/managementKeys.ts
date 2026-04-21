import { z } from 'zod';

const OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/keys';

export const OPENFLOW_KEY_NAME = 'OPENFLOW-KEY';
const OPENFLOW_KEY_BUDGET = 1;
const OPENFLOW_KEY_BUDGET_RESET = 'monthly';

const CreateKeyResponseSchema = z.object({
  data: z.object({
    key: z.string(),
    hash: z.string(),
  }),
});

export interface OpenRouterKeyResult {
  key: string;
  hash: string;
}

export async function createOpenRouterKey(orgName: string): Promise<OpenRouterKeyResult | null> {
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY ?? '';
  if (managementKey === '') {
    process.stderr.write('[openrouter] OPENROUTER_MANAGEMENT_KEY not set, skipping key creation\n');
    return null;
  }

  const res = await fetch(OPENROUTER_KEYS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managementKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `${OPENFLOW_KEY_NAME}-${orgName}`,
      limit: OPENFLOW_KEY_BUDGET,
      limitReset: OPENFLOW_KEY_BUDGET_RESET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter key creation failed (${String(res.status)}): ${text}`);
  }

  const json: unknown = await res.json();
  const parsed = CreateKeyResponseSchema.parse(json);
  process.stdout.write(`[openrouter] Created key for org "${orgName}" (hash: ${parsed.data.hash})\n`);
  return parsed.data;
}
