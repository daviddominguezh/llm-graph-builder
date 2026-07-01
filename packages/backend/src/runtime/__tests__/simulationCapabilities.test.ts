import { describe, expect, it } from '@jest/globals';

import {
  consoleLogger,
  consoleObservability,
  noopPersistence,
  noopRateLimit,
  syncRecurseStrategy,
  type McpInvoker,
  type SupabaseLike,
} from '@daviddh/llm-graph-runner';

import {
  buildSimulationCapabilities,
  buildSimulationRuntimeServices,
} from '../simulationCapabilities.js';

describe('buildSimulationCapabilities', () => {
  it('wires the sim impls (inline dispatch, noop persistence/rate-limit, console caps)', () => {
    const caps = buildSimulationCapabilities();
    expect(caps.persistence).toBe(noopPersistence);
    expect(caps.dispatch).toBe(syncRecurseStrategy);
    expect(caps.observability).toBe(consoleObservability);
    expect(caps.rateLimit).toBe(noopRateLimit);
    expect(caps.logger).toBe(consoleLogger);
  });
});

describe('buildSimulationRuntimeServices', () => {
  const supabase: SupabaseLike = { marker: 'supabase' };
  const mcpPool: McpInvoker = { invoke: async () => await Promise.resolve('result') };

  it('passes through the REAL in-process mcpPool (not a noop) and supabase', () => {
    const services = buildSimulationRuntimeServices(supabase, mcpPool);
    expect(services.mcpPool).toBe(mcpPool);
    expect(services.supabase).toBe(supabase);
  });

  it('exposes resolveChildConfig as a function bound to the backend resolver', () => {
    const services = buildSimulationRuntimeServices(supabase, mcpPool);
    expect(typeof services.resolveChildConfig).toBe('function');
  });
});
