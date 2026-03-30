'use client';

import type { Operation } from '@daviddh/graph-types';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';

interface ContextItem {
  sortOrder: number;
  content: string;
}

interface AgentEditorState {
  setSystemPrompt: Dispatch<SetStateAction<string>>;
  setMaxSteps: Dispatch<SetStateAction<number | null>>;
  setContextItems: Dispatch<SetStateAction<ContextItem[]>>;
}

type PushOperation = (op: Operation) => void;

function usePromptAction(
  setState: Dispatch<SetStateAction<string>>,
  push: PushOperation
): (value: string) => void {
  return useCallback(
    (value: string) => {
      setState(value);
      push({ type: 'updateAgentConfig', data: { systemPrompt: value } });
    },
    [setState, push]
  );
}

function useMaxStepsAction(
  setState: Dispatch<SetStateAction<number | null>>,
  push: PushOperation
): (value: number | null) => void {
  return useCallback(
    (value: number | null) => {
      setState(value);
      push({ type: 'updateAgentConfig', data: { maxSteps: value } });
    },
    [setState, push]
  );
}

function useInsertItemAction(
  setState: Dispatch<SetStateAction<ContextItem[]>>,
  push: PushOperation
): (sortOrder: number, content: string) => void {
  return useCallback(
    (sortOrder: number, content: string) => {
      setState((prev) => [...prev, { sortOrder, content }]);
      push({ type: 'insertContextItem', data: { sortOrder, content } });
    },
    [setState, push]
  );
}

function useUpdateItemAction(
  setState: Dispatch<SetStateAction<ContextItem[]>>,
  push: PushOperation
): (sortOrder: number, content: string) => void {
  return useCallback(
    (sortOrder: number, content: string) => {
      setState((prev) => prev.map((item) => (item.sortOrder === sortOrder ? { ...item, content } : item)));
      push({ type: 'updateContextItem', data: { sortOrder, content } });
    },
    [setState, push]
  );
}

function useDeleteItemAction(
  setState: Dispatch<SetStateAction<ContextItem[]>>,
  push: PushOperation
): (sortOrder: number) => void {
  return useCallback(
    (sortOrder: number) => {
      setState((prev) => prev.filter((item) => item.sortOrder !== sortOrder));
      push({ type: 'deleteContextItem', data: { sortOrder } });
    },
    [setState, push]
  );
}

interface AgentEditorActions {
  handleSystemPromptChange: (value: string) => void;
  handleMaxStepsChange: (value: number | null) => void;
  handleInsertItem: (sortOrder: number, content: string) => void;
  handleUpdateItem: (sortOrder: number, content: string) => void;
  handleDeleteItem: (sortOrder: number) => void;
}

export function useAgentEditorActions(
  state: AgentEditorState,
  pushOperation: PushOperation
): AgentEditorActions {
  return {
    handleSystemPromptChange: usePromptAction(state.setSystemPrompt, pushOperation),
    handleMaxStepsChange: useMaxStepsAction(state.setMaxSteps, pushOperation),
    handleInsertItem: useInsertItemAction(state.setContextItems, pushOperation),
    handleUpdateItem: useUpdateItemAction(state.setContextItems, pushOperation),
    handleDeleteItem: useDeleteItemAction(state.setContextItems, pushOperation),
  };
}
