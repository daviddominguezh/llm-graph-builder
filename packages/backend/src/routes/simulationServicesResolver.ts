import { makeKvStoreService } from '../services/kvStoreService.js';
import { makeNoStoreBoundKvServices, makeNoStoreBoundRagServices } from '../services/noStoreBoundServices.js';
import { makeRagStoreService } from '../services/ragStoreService.js';
import type { OrchestratorConfig } from './simulationOrchestratorTypes.js';

function resolveKvServices(config: OrchestratorConfig): unknown {
  const storeId = config.body.selectedKvStoreId ?? null;
  if (storeId === null) return makeNoStoreBoundKvServices();
  return makeKvStoreService(config.supabase, storeId);
}

function resolveRagServices(config: OrchestratorConfig): unknown {
  const storeId = config.body.selectedRagStoreId ?? null;
  if (storeId === null) return makeNoStoreBoundRagServices();
  return makeRagStoreService(config.supabase, storeId);
}

export function buildSimulationServices(config: OrchestratorConfig): (providerId: string) => unknown {
  return (providerId: string): unknown => {
    if (providerId === 'kv_store') return resolveKvServices(config);
    if (providerId === 'rag') return resolveRagServices(config);
    return undefined;
  };
}
