import { describe, expect, it, jest } from '@jest/globals';

import { simulatedNoop } from '../../runtime/simulatedNoop.js';
import type { Logger } from '../../utils/logger.js';
import type { ProviderCtx } from '../provider.js';

const ROOT_DISPATCH_DEPTH = 0;
const SAMPLE_WRITE_VALUE = 1;

function makeLogger(): Logger {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    help: jest.fn(),
    data: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    prompt: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    input: jest.fn(),
    silly: jest.fn(),
  };
}

function simCtx(): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: 't',
    agentId: 'a',
    isChildAgent: false,
    dispatchDepth: ROOT_DISPATCH_DEPTH,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
    environment: 'simulation',
    simulationState: {},
    writeSimulationState: () => undefined,
  };
}

describe('ProviderCtx env discriminant', () => {
  it('narrows to the simulation arm and simulatedNoop returns the marker', async () => {
    const ctx = simCtx();
    if (ctx.environment === 'simulation') ctx.writeSimulationState('/x', SAMPLE_WRITE_VALUE);
    expect(await simulatedNoop({}, ctx)).toEqual({ simulated: true });
  });
});
