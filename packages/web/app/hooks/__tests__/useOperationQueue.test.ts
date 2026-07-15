/**
 * @jest-environment jsdom
 */
import type { Operation } from '@daviddh/graph-types';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { DebugGraphState, LocalGraphProvider } from '../../utils/graphSaveDebug';

type SendDebugged = (
  agentId: string,
  ops: Operation[],
  getLocalGraph: LocalGraphProvider,
  getPendingCount: () => number
) => Promise<void>;

const sendOperationsDebuggedMock = jest.fn<SendDebugged>();

jest.unstable_mockModule('../../utils/graphSaveDebug', () => ({
  sendOperationsDebugged: sendOperationsDebuggedMock,
}));

const { useOperationQueue } = await import('../useOperationQueue');
const { act, renderHook } = await import('@testing-library/react');

function op(nodeId: string): Operation {
  return { type: 'deleteNode', nodeId };
}

describe('useOperationQueue', () => {
  beforeEach(() => {
    sendOperationsDebuggedMock.mockReset();
    sendOperationsDebuggedMock.mockResolvedValue(undefined);
  });

  it('tracks pending ops and bumps flushSeq on push', () => {
    const { result } = renderHook(() => useOperationQueue('agent-1'));

    expect(result.current.hasPendingOps).toBe(false);
    act(() => {
      result.current.pushOperation(op('a'));
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.hasPendingOps).toBe(true);
    expect(result.current.flushSeq).toBe(1);
  });

  it('flush sends queued ops for the agent and drains the queue', async () => {
    const { result } = renderHook(() => useOperationQueue('agent-1'));

    act(() => {
      result.current.pushOperation(op('a'));
      result.current.pushOperation(op('b'));
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(sendOperationsDebuggedMock).toHaveBeenCalledTimes(1);
    expect(sendOperationsDebuggedMock.mock.calls[0]?.[0]).toBe('agent-1');
    expect(sendOperationsDebuggedMock.mock.calls[0]?.[1]).toEqual([op('a'), op('b')]);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.hasPendingOps).toBe(false);
  });

  it('flush without an agent id keeps ops queued and sends nothing', async () => {
    const { result } = renderHook(() => useOperationQueue(undefined));

    act(() => {
      result.current.pushOperation(op('a'));
    });
    await act(async () => {
      await result.current.flush();
    });

    expect(sendOperationsDebuggedMock).not.toHaveBeenCalled();
    expect(result.current.pendingCount).toBe(1);
  });

  it('keeps ops pending when the send fails', async () => {
    sendOperationsDebuggedMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useOperationQueue('agent-1'));

    act(() => {
      result.current.pushOperation(op('a'));
    });
    await act(async () => {
      await expect(result.current.flush()).rejects.toThrow('offline');
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.hasPendingOps).toBe(true);
  });

  it('clearQueue discards pending ops', () => {
    const { result } = renderHook(() => useOperationQueue('agent-1'));

    act(() => {
      result.current.pushOperation(op('a'));
      result.current.clearQueue();
    });

    expect(result.current.pendingCount).toBe(0);
  });

  it('plumbs the local graph provider through to the debugged send', async () => {
    const state: DebugGraphState = { nodes: [{ id: 'start' }], edges: [] };
    const localGraphRef = { current: (() => state) as LocalGraphProvider };
    const { result } = renderHook(() => useOperationQueue('agent-1', localGraphRef));

    act(() => {
      result.current.pushOperation(op('a'));
    });
    await act(async () => {
      await result.current.flush();
    });

    const getLocalGraph = sendOperationsDebuggedMock.mock.calls[0]?.[2];
    expect(getLocalGraph?.()).toEqual(state);
    const getPendingCount = sendOperationsDebuggedMock.mock.calls[0]?.[3];
    expect(getPendingCount?.()).toBe(0);
  });
});
