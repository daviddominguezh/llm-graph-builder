import { describe, expect, it } from '@jest/globals';

import { mapTerminationToChildResult } from '../childResult.js';

describe('mapTerminationToChildResult — finish sentinel', () => {
  it('explicit finish success → finished/success', () => {
    expect(
      mapTerminationToChildResult({
        environment: 'simulation',
        finishResult: { __sentinel: 'finish', output: 'ok', status: 'success' },
        lastAssistantText: '',
      })
    ).toEqual({ status: 'finished', result: 'ok', outcome: 'success' });
  });

  it('explicit finish error → finished/error', () => {
    expect(
      mapTerminationToChildResult({
        environment: 'production',
        finishResult: { __sentinel: 'finish', output: 'bad', status: 'error' },
        lastAssistantText: '',
      })
    ).toEqual({ status: 'finished', result: 'bad', outcome: 'error' });
  });

  it('finish result takes precedence over last assistant text', () => {
    expect(
      mapTerminationToChildResult({
        environment: 'production',
        finishResult: { __sentinel: 'finish', output: 'final', status: 'success' },
        lastAssistantText: 'partial',
      })
    ).toEqual({ status: 'finished', result: 'final', outcome: 'success' });
  });
});

describe('mapTerminationToChildResult — END without finish (env-aware)', () => {
  it('simulation → awaiting_input with last text', () => {
    expect(mapTerminationToChildResult({ environment: 'simulation', lastAssistantText: 'hold on' })).toEqual({
      status: 'awaiting_input',
      partial: 'hold on',
    });
  });

  it('production with text → finished/success', () => {
    expect(mapTerminationToChildResult({ environment: 'production', lastAssistantText: 'answer' })).toEqual({
      status: 'finished',
      result: 'answer',
      outcome: 'success',
    });
  });

  it('production with no text → error/no_result', () => {
    const r = mapTerminationToChildResult({ environment: 'production', lastAssistantText: '' });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.code).toBe('no_result');
  });
});

describe('mapTerminationToChildResult — depth exceeded', () => {
  it('depth exceeded → error/max_depth_exceeded', () => {
    const r = mapTerminationToChildResult({
      environment: 'simulation',
      lastAssistantText: '',
      depthExceeded: true,
    });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.code).toBe('max_depth_exceeded');
  });

  it('depth exceeded takes precedence over an explicit finish result', () => {
    const r = mapTerminationToChildResult({
      environment: 'production',
      finishResult: { __sentinel: 'finish', output: 'ok', status: 'success' },
      lastAssistantText: 'ignored',
      depthExceeded: true,
    });
    expect(r.status).toBe('error');
    if (r.status === 'error') expect(r.code).toBe('max_depth_exceeded');
  });
});

describe('mapTerminationToChildResult — explicit failure passthrough', () => {
  it('aborted → error/aborted with message', () => {
    const r = mapTerminationToChildResult({
      environment: 'simulation',
      lastAssistantText: '',
      failure: { kind: 'aborted', message: 'stopped' },
    });
    expect(r.status).toBe('error');
    if (r.status === 'error') {
      expect(r.code).toBe('aborted');
      expect(r.message).toBe('stopped');
    }
  });

  it('child_failed → error/child_failed', () => {
    const r = mapTerminationToChildResult({
      environment: 'production',
      lastAssistantText: '',
      failure: { kind: 'child_failed', message: 'boom' },
    });
    if (r.status === 'error') expect(r.code).toBe('child_failed');
  });

  it('timeout → error/timeout', () => {
    const r = mapTerminationToChildResult({
      environment: 'production',
      lastAssistantText: '',
      failure: { kind: 'timeout', message: 'too slow' },
    });
    if (r.status === 'error') expect(r.code).toBe('timeout');
  });

  it('agent_not_published → error/agent_not_published', () => {
    const r = mapTerminationToChildResult({
      environment: 'production',
      lastAssistantText: '',
      failure: { kind: 'agent_not_published', message: 'not published' },
    });
    if (r.status === 'error') expect(r.code).toBe('agent_not_published');
  });
});
