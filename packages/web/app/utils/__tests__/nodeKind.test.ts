import { describe, expect, it } from '@jest/globals';
import type { Edge } from '@xyflow/react';

import type { RFEdgeData } from '../graphTransformers';
import {
  getNodeKind,
  getRowModeSourceIds,
  isRowModeNodeKind,
  normalizeRowModeHandles,
} from '../nodeKind';

function edge(id: string, source: string, target: string, type?: RFEdgeData['preconditions']): Edge<RFEdgeData> {
  return { id, source, target, data: { preconditions: type } };
}

const decision = [{ type: 'agent_decision' as const, value: 'c' }];
const userSaid = [{ type: 'user_said' as const, value: 'c' }];
const toolCall = [{ type: 'tool_call' as const, tool: { toolName: 't' } } as unknown as NonNullable<RFEdgeData['preconditions']>[number]];

describe('getNodeKind', () => {
  it('returns agent when no outgoing edges', () => {
    expect(getNodeKind('A', [])).toBe('agent');
  });
  it('classifies agent_decision and user_routing from first precondition', () => {
    const edges = [edge('A-B-0', 'A', 'B', decision), edge('C-D-0', 'C', 'D', userSaid)];
    expect(getNodeKind('A', edges)).toBe('agent_decision');
    expect(getNodeKind('C', edges)).toBe('user_routing');
  });
  it('classifies tool_call', () => {
    expect(getNodeKind('A', [edge('A-B-0', 'A', 'B', toolCall)])).toBe('tool_call');
  });
});

describe('isRowModeNodeKind', () => {
  it('is true only for decision and user routing', () => {
    expect(isRowModeNodeKind('agent_decision')).toBe(true);
    expect(isRowModeNodeKind('user_routing')).toBe(true);
    expect(isRowModeNodeKind('tool_call')).toBe(false);
    expect(isRowModeNodeKind('agent')).toBe(false);
  });
});

describe('getRowModeSourceIds', () => {
  it('collects only row-mode source nodes', () => {
    const edges = [edge('A-B-0', 'A', 'B', decision), edge('T-U-0', 'T', 'U', toolCall)];
    const ids = getRowModeSourceIds(edges);
    expect(ids.has('A')).toBe(true);
    expect(ids.has('T')).toBe(false);
  });
  it('treats the start node (INITIAL_STEP) as row-mode when it routes user_said edges', () => {
    const edges = [edge('INITIAL_STEP-A-0', 'INITIAL_STEP', 'A', userSaid)];
    expect(getRowModeSourceIds(edges).has('INITIAL_STEP')).toBe(true);
  });
});

describe('normalizeRowModeHandles', () => {
  it('sets sourceHandle to edge id and targetHandle left-target for row-mode branch edges', () => {
    const edges = [
      edge('A-B-0', 'A', 'B', decision),
      edge('A-C-1', 'A', 'C', decision),
      edge('T-U-0', 'T', 'U', toolCall),
    ].map((e) => ({ ...e, sourceHandle: 'right-source', targetHandle: 'left-target' }));
    const out = normalizeRowModeHandles(edges);
    expect(out[0]?.sourceHandle).toBe('A-B-0');
    expect(out[1]?.sourceHandle).toBe('A-C-1');
    expect(out[0]?.targetHandle).toBe('left-target');
    expect(out[2]?.sourceHandle).toBe('right-source'); // tool edge untouched
  });
  it('returns the same edge reference when already normalized (idempotent)', () => {
    const e = { ...edge('A-B-0', 'A', 'B', decision), sourceHandle: 'A-B-0', targetHandle: 'left-target' };
    const out = normalizeRowModeHandles([e]);
    expect(out[0]).toBe(e);
  });
});
