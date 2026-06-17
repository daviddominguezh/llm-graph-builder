import type { SelectedTool } from '@daviddh/llm-graph-runner';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';

const SAMPLE_TOOL: SelectedTool = {
  providerType: 'builtin',
  providerId: 'kv_store',
  toolName: 'list_keys',
};

const AGENT_ID = 'agent-1';
const ORG_ID = 'org-1';
const PUBLISHED_VERSION = 3;
const ONE_TOOL = 1;
const KV_STORE_ID = 'kv-published';
const RAG_STORE_ID = 'rag-published';

/* ------------------------------------------------------------------ */
/*  Mock the agentQueries module (getAgentById)                        */
/* ------------------------------------------------------------------ */

interface AgentRowStub {
  id: string;
  org_id: string;
  selected_tools: SelectedTool[];
}

const mockGetAgentById =
  jest.fn<(supabase: SupabaseClient, id: string) => Promise<{ result: AgentRowStub | null; error: null }>>();

jest.unstable_mockModule('../../db/queries/agentQueries.js', () => ({
  getAgentById: mockGetAgentById,
}));

const { fetchAgentRecordVersionAware } = await import('./executeAgentRecord.js');

interface SnapshotRowStub {
  selected_tools: SelectedTool[];
  selected_kv_store_id: string | null;
  selected_rag_store_id: string | null;
}

type SnapshotFn = (
  supabase: SupabaseClient,
  agentId: string,
  version: number
) => Promise<SnapshotRowStub | null>;

const mockCreateSupabase = jest.fn<() => SupabaseClient>();
const supabase = mockCreateSupabase();

beforeEach(() => {
  mockGetAgentById.mockReset();
  mockGetAgentById.mockResolvedValue({
    result: {
      id: AGENT_ID,
      org_id: ORG_ID,
      selected_tools: [SAMPLE_TOOL],
    },
    error: null,
  });
});

describe('fetchAgentRecordVersionAware — published reads the snapshot', () => {
  it('returns bindings + selected_tools from the snapshot row', async () => {
    const snapshot: SnapshotRowStub = {
      selected_tools: [SAMPLE_TOOL],
      selected_kv_store_id: KV_STORE_ID,
      selected_rag_store_id: RAG_STORE_ID,
    };
    const fetchSnapshot: SnapshotFn = jest.fn<SnapshotFn>().mockResolvedValue(snapshot);
    const rec = await fetchAgentRecordVersionAware(supabase, AGENT_ID, PUBLISHED_VERSION, fetchSnapshot);
    expect(rec.org_id).toBe(ORG_ID);
    expect(rec.selected_kv_store_id).toBe(KV_STORE_ID);
    expect(rec.selected_rag_store_id).toBe(RAG_STORE_ID);
    expect(rec.selected_tools).toHaveLength(ONE_TOOL);
  });
});

describe('fetchAgentRecordVersionAware — legacy versions fail closed', () => {
  it('returns null bindings + empty tools when snapshot row is missing', async () => {
    const fetchSnapshot: SnapshotFn = jest.fn<SnapshotFn>().mockResolvedValue(null);
    const rec = await fetchAgentRecordVersionAware(supabase, AGENT_ID, PUBLISHED_VERSION, fetchSnapshot);
    expect(rec.selected_kv_store_id).toBeNull();
    expect(rec.selected_rag_store_id).toBeNull();
    expect(rec.selected_tools).toEqual([]);
  });

  it('passes the running version through to the snapshot fetcher', async () => {
    const fetchSnapshot: SnapshotFn = jest.fn<SnapshotFn>().mockResolvedValue(null);
    await fetchAgentRecordVersionAware(supabase, AGENT_ID, PUBLISHED_VERSION, fetchSnapshot);
    expect(fetchSnapshot).toHaveBeenCalledWith(supabase, AGENT_ID, PUBLISHED_VERSION);
  });
});
