import type { Operation } from '@daviddh/graph-types';

import {
  deleteContextItem,
  insertContextItem,
  reorderContextItems,
  updateAgentConfig,
  updateContextItem,
} from './agentConfigOperations.js';
import { deleteAgent, insertAgent, updateAgent } from './agentOperations.js';
import { deleteContextPreset, insertContextPreset, updateContextPreset } from './contextPresetOperations.js';
import { deleteEdge, insertEdge, updateEdge } from './edgeOperations.js';
import { deleteMcpServer, insertMcpServer, updateMcpServer } from './mcpServerOperations.js';
import { deleteNode, insertNode, updateNode } from './nodeOperations.js';
import type { SupabaseClient } from './operationHelpers.js';
import { deleteOutputSchema, insertOutputSchema, updateOutputSchema } from './outputSchemaOperations.js';
import { updateStartNode } from './startNodeOperations.js';

async function dispatchNodeOps(supabase: SupabaseClient, agentId: string, op: Operation): Promise<void> {
  if (op.type === 'insertNode') {
    await insertNode(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateNode') {
    await updateNode(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteNode') {
    await deleteNode(supabase, agentId, op.nodeId);
    return;
  }
  await dispatchEdgeOps(supabase, agentId, op);
}

async function dispatchEdgeOps(supabase: SupabaseClient, agentId: string, op: Operation): Promise<void> {
  if (op.type === 'insertEdge') {
    await insertEdge(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateEdge') {
    await updateEdge(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteEdge') {
    await deleteEdge(supabase, agentId, op.from, op.to);
    return;
  }
  await dispatchAgentOps(supabase, agentId, op);
}

async function dispatchAgentOps(supabase: SupabaseClient, agentId: string, op: Operation): Promise<void> {
  if (op.type === 'insertAgent') {
    await insertAgent(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateAgent') {
    await updateAgent(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteAgent') {
    await deleteAgent(supabase, agentId, op.agentKey);
    return;
  }
  await dispatchMcpOps(supabase, agentId, op);
}

async function dispatchMcpOps(supabase: SupabaseClient, agentId: string, op: Operation): Promise<void> {
  if (op.type === 'insertMcpServer') {
    await insertMcpServer(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateMcpServer') {
    await updateMcpServer(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteMcpServer') {
    await deleteMcpServer(supabase, agentId, op.serverId);
    return;
  }
  await dispatchOutputSchemaOps(supabase, agentId, op);
}

async function dispatchOutputSchemaOps(
  supabase: SupabaseClient,
  agentId: string,
  op: Operation
): Promise<void> {
  if (op.type === 'insertOutputSchema') {
    await insertOutputSchema(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateOutputSchema') {
    await updateOutputSchema(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteOutputSchema') {
    await deleteOutputSchema(supabase, agentId, op.schemaId);
    return;
  }
  await dispatchPresetOps(supabase, agentId, op);
}

async function dispatchPresetOps(supabase: SupabaseClient, agentId: string, op: Operation): Promise<void> {
  if (op.type === 'insertContextPreset') {
    await insertContextPreset(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateContextPreset') {
    await updateContextPreset(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteContextPreset') {
    await deleteContextPreset(supabase, agentId, op.name);
    return;
  }
  if (op.type === 'updateStartNode') {
    await updateStartNode(supabase, agentId, op.startNode);
    return;
  }

  await dispatchAgentConfigOps(supabase, agentId, op);
}

async function dispatchAgentConfigOps(
  supabase: SupabaseClient,
  agentId: string,
  op: Operation
): Promise<void> {
  if (op.type === 'updateAgentConfig') {
    await updateAgentConfig(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'insertContextItem') {
    await insertContextItem(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'updateContextItem') {
    await updateContextItem(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'deleteContextItem') {
    await deleteContextItem(supabase, agentId, op.data);
    return;
  }
  if (op.type === 'reorderContextItems') {
    await reorderContextItems(supabase, agentId, op.data);
    return;
  }
  throw new Error(`Unhandled operation type: ${op.type}`);
}

export async function executeSingleOperation(
  supabase: SupabaseClient,
  agentId: string,
  op: Operation
): Promise<void> {
  await dispatchNodeOps(supabase, agentId, op);
}
