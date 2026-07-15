'use client';

import { Textarea } from '@/components/ui/textarea';

import type { Dispatch } from '../../editor-actions/actionRegistry';
import { useCommittedField } from '../../editor-actions/useCommittedField';
import type { HistorySnapshot } from '../../editor-history/historyStore';

interface CommittedNodeTextareaProps {
  nodeId: string;
  fieldKey: string;
  value: string;
  getState: () => HistorySnapshot;
  dispatch: Dispatch;
  onValueChange: (value: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
}

/**
 * Textarea whose edits update live state per keystroke but push a single undo
 * entry per typing burst (800ms idle or blur) via `node.commitProps`. Mount this
 * with a `key` that includes the node id so each selected node gets a fresh
 * commit session (lastCommitted is seeded from the mount-time value).
 */
export function CommittedNodeTextarea({
  nodeId,
  fieldKey,
  value,
  getState,
  dispatch,
  onValueChange,
  id,
  rows,
  placeholder,
}: CommittedNodeTextareaProps) {
  const field = useCommittedField({
    value,
    fieldKey,
    getState,
    onLiveChange: onValueChange,
    onCommit: ({ preState, coalesceKey }) =>
      dispatch('node.commitProps', { nodeId }, { preState, coalesceKey }),
  });

  return (
    <Textarea
      id={id}
      value={value}
      onChange={(e) => field.onChange(e.target.value)}
      onBlur={field.onBlur}
      rows={rows}
      placeholder={placeholder}
    />
  );
}
