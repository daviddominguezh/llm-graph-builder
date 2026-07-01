import type { AgentSimulateRequestBody } from './agentSimulationApi';
import type { SimulateRequestBody, StreamCallbacks } from './api';
import { readSseStream } from './api';

/**
 * Workflow simulation body. The backend (RU3 Task 18) routes by `appType`, so
 * the FE only reports the engine type — it no longer picks the endpoint.
 */
export type WorkflowSimulateRequestBody = SimulateRequestBody & { appType?: 'workflow' };

/**
 * Unified simulation request body. Agent bodies carry `appType: 'agent'`;
 * workflow bodies carry `appType: 'workflow'` (or omit it). Both POST the same
 * `/api/simulate` endpoint — this collapses the former agent-vs-workflow split.
 */
export type SimulationRequestBody = WorkflowSimulateRequestBody | AgentSimulateRequestBody;

/**
 * The single FE simulation stream function. Replaces the former separate
 * workflow and agent stream functions — the backend now routes by `appType`.
 */
export async function streamSimulation(
  body: SimulationRequestBody,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Simulation request failed: ${String(res.status)}`);
  }

  const reader = res.body?.getReader();
  if (reader === undefined) {
    throw new Error('No response stream available');
  }

  await readSseStream(reader, callbacks);
}
