import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { ChildResult } from '../../runtime/childResult.js';
import type { Logger } from '../../utils/logger.js';
import { setLogger } from '../../utils/logger.js';
import { consoleLogger, consoleObservability, noopRateLimit } from '../consoleCapabilities.js';
import { noopPersistence } from '../noopPersistence.js';

type LoggerMock = ReturnType<typeof jest.fn>;

interface StubLogger {
  logger: Logger;
  info: LoggerMock;
  warn: LoggerMock;
  error: LoggerMock;
}

const stubLogger = (): StubLogger => {
  const info: LoggerMock = jest.fn();
  const warn: LoggerMock = jest.fn();
  const error: LoggerMock = jest.fn();
  const noop: LoggerMock = jest.fn();
  const logger: Logger = {
    error,
    warn,
    info,
    help: noop,
    data: noop,
    debug: noop,
    prompt: noop,
    http: noop,
    verbose: noop,
    input: noop,
    silly: noop,
  };
  return { logger, info, warn, error };
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('noopPersistence', () => {
  it('listPending returns empty', async () => {
    expect(await noopPersistence.listPending('x')).toEqual([]);
  });

  it('beforeDispatch returns a sim handle', async () => {
    const handle = await noopPersistence.beforeDispatch({
      executionId: 'e1',
      parentSnapshot: {},
      childInput: {},
    });
    expect(handle).toEqual({ executionId: 'sim', childExecutionId: 'sim-child' });
  });

  it('onChildFinish and onChildError record nothing', async () => {
    const handle = { executionId: 'sim', childExecutionId: 'sim-child' };
    const childResult: ChildResult = { status: 'finished', result: 'ok', outcome: 'success' };
    await expect(noopPersistence.onChildFinish({ handle, childResult })).resolves.toBeUndefined();
    await expect(
      noopPersistence.onChildError({ handle, error: new Error('boom') })
    ).resolves.toBeUndefined();
    expect(await noopPersistence.listPending('sim')).toEqual([]);
  });
});

describe('noopRateLimit', () => {
  it('acquire resolves immediately for any tenant', async () => {
    await expect(noopRateLimit.acquire('t1')).resolves.toBeUndefined();
  });
});

describe('consoleObservability', () => {
  it('routes events through the logger proxy', () => {
    const { logger, info } = stubLogger();
    setLogger(logger);
    consoleObservability.event('node_started', { nodeId: 'n1' });
    expect(info).toHaveBeenCalledWith('[sim] node_started', { nodeId: 'n1' });
  });

  it('defaults data to an empty object', () => {
    const { logger, info } = stubLogger();
    setLogger(logger);
    consoleObservability.event('bare');
    expect(info).toHaveBeenCalledWith('[sim] bare', {});
  });
});

describe('consoleLogger', () => {
  it('routes each level through the matching logger method', () => {
    const { logger, info, warn, error } = stubLogger();
    setLogger(logger);
    consoleLogger.info('i', { a: 'x' });
    consoleLogger.warn('w');
    consoleLogger.error('e', { err: true });
    expect(info).toHaveBeenCalledWith('i', { a: 'x' });
    expect(warn).toHaveBeenCalledWith('w', {});
    expect(error).toHaveBeenCalledWith('e', { err: true });
  });
});
