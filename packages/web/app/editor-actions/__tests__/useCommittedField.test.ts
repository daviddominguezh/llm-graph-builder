/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';

import type { HistorySnapshot } from '../../editor-history/historyStore';
import type { CommittedFieldApi, CommittedFieldCommit, CommittedFieldParams } from '../useCommittedField';
import { useCommittedField } from '../useCommittedField';

const DEBOUNCE = 800;
const FIRST = 0;
const SECOND = 1;
const THIRD = 2;
const NONE = 0;
const ONE = 1;
const TWO = 2;
const ORIGIN = 0;

function setup(initial = 'hello'): {
  hook: ReturnType<typeof renderHook<CommittedFieldApi, CommittedFieldParams>>;
  live: jest.Mock<(v: string) => void>;
  commits: CommittedFieldCommit[];
  state: HistorySnapshot;
} {
  const state: HistorySnapshot = { nodes: [], edges: [] };
  const live = jest.fn<(v: string) => void>();
  const commits: CommittedFieldCommit[] = [];
  const props: CommittedFieldParams = {
    value: initial,
    fieldKey: 'node-1:text',
    getState: () => state,
    onLiveChange: live,
    onCommit: (c) => {
      commits.push(c);
    },
  };
  const hook = renderHook((p: CommittedFieldParams) => useCommittedField(p), { initialProps: props });
  return { hook, live, commits, state };
}

/**
 * Setup whose `getState` returns a NEW snapshot derived from a mutable holder
 * that `onLiveChange` writes into. This makes preState-capture ordering
 * observable: capturing after the live change would leak the typed value.
 */
function setupMutable(): {
  hook: ReturnType<typeof renderHook<CommittedFieldApi, CommittedFieldParams>>;
  commits: CommittedFieldCommit[];
} {
  let liveText = 'initial';
  const getState = (): HistorySnapshot => ({
    nodes: [
      {
        id: 'n',
        type: 'agent',
        position: { x: ORIGIN, y: ORIGIN },
        data: { nodeId: 'n', text: liveText, description: '' },
      },
    ],
    edges: [],
  });
  const commits: CommittedFieldCommit[] = [];
  const props: CommittedFieldParams = {
    value: 'hello',
    fieldKey: 'node-1:text',
    getState,
    onLiveChange: (v: string) => {
      liveText = v;
    },
    onCommit: (c) => {
      commits.push(c);
    },
  };
  const hook = renderHook((p: CommittedFieldParams) => useCommittedField(p), { initialProps: props });
  return { hook, commits };
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('useCommittedField: debounce and preState', () => {
  it('applies live changes per keystroke but does not commit until idle', () => {
    const { hook, live, commits } = setup();
    act(() => {
      hook.result.current.onChange('h');
    });
    act(() => {
      hook.result.current.onChange('he');
    });
    expect(live).toHaveBeenCalledTimes(TWO);
    expect(commits).toHaveLength(NONE);
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE);
    });
    expect(commits).toHaveLength(ONE);
    expect(commits[FIRST]?.value).toBe('he');
  });

  it('captures preState before the first keystroke of a session', () => {
    const { hook, commits } = setupMutable();
    act(() => {
      hook.result.current.onChange('typed');
    });
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE);
    });
    expect(commits[FIRST]?.preState.nodes[FIRST]?.data.text).toBe('initial');
  });
});

describe('useCommittedField: blur and no-op', () => {
  it('blur commits immediately and cancels the pending debounce', () => {
    const { hook, commits } = setup();
    act(() => {
      hook.result.current.onChange('draft');
    });
    act(() => {
      hook.result.current.onBlur();
    });
    expect(commits).toHaveLength(ONE);
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE);
    });
    expect(commits).toHaveLength(ONE);
  });

  it('no-op commit when the value did not change', () => {
    const { hook, commits } = setup('same');
    act(() => {
      hook.result.current.onChange('same');
    });
    act(() => {
      hook.result.current.onBlur();
    });
    expect(commits).toHaveLength(NONE);
  });
});

describe('useCommittedField: coalesceKey and unmount', () => {
  it('debounce commits mid-burst share one coalesceKey; a new focus session mints a new one', () => {
    const { hook, commits } = setup();
    act(() => {
      hook.result.current.onChange('a');
    });
    act(() => {
      jest.advanceTimersByTime(DEBOUNCE);
    });
    act(() => {
      hook.result.current.onChange('ab');
    });
    act(() => {
      hook.result.current.onBlur();
    });
    expect(commits).toHaveLength(TWO);
    expect(commits[SECOND]?.coalesceKey).toBe(commits[FIRST]?.coalesceKey);

    act(() => {
      hook.result.current.onChange('abc');
    });
    act(() => {
      hook.result.current.onBlur();
    });
    expect(commits[THIRD]?.coalesceKey).not.toBe(commits[FIRST]?.coalesceKey);
  });

  it('flushes a pending commit on unmount', () => {
    const { hook, commits } = setup();
    act(() => {
      hook.result.current.onChange('bye');
    });
    hook.unmount();
    expect(commits).toHaveLength(ONE);
    expect(commits[FIRST]?.value).toBe('bye');
  });
});
