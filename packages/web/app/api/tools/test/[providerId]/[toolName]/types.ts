import { z } from 'zod';

export const TestToolRequestSchema = z.object({
  agentId: z.string().min(1),
  tenantId: z.string().min(1).optional(),
  args: z.record(z.string(), z.unknown()),
});

export type TestToolRequest = z.infer<typeof TestToolRequestSchema>;

export interface AgentBindingRow {
  org_id: string;
  selected_kv_store_id: string | null;
  selected_rag_store_id: string | null;
}

export function isAgentBindingRow(value: unknown): value is AgentBindingRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'org_id' in value && 'selected_kv_store_id' in value && 'selected_rag_store_id' in value;
}

export interface TenantIdRow {
  id: string;
}

export function isTenantIdRow(value: unknown): value is TenantIdRow {
  return typeof value === 'object' && value !== null && 'id' in value;
}

export interface BackendOkPayload {
  ok: true;
  result: unknown;
}

export interface BackendErrorPayload {
  ok: false;
  error: { code: string; message: string };
}

export type BackendPayload = BackendOkPayload | BackendErrorPayload;

export function isBackendPayload(value: unknown): value is BackendPayload {
  if (typeof value !== 'object' || value === null) return false;
  if (!('ok' in value)) return false;
  const ok = (value as { ok: unknown }).ok;
  if (ok === true) return 'result' in value;
  if (ok === false) return 'error' in value;
  return false;
}
