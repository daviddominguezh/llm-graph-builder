'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getNextMockResponse } from './copilotMocks';
import type { CopilotMessage, CopilotMessageBlock, CopilotTextBlock } from './copilotTypes';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StreamState {
  blockIndex: number;
  wordIndex: number;
  targetBlocks: CopilotMessageBlock[];
  currentBlocks: CopilotMessageBlock[];
}

export interface UseCopilotStreamingReturn {
  isStreaming: boolean;
  startStreaming: (userText: string) => void;
  stopStreaming: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUserMessage(userText: string): CopilotMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    blocks: [{ type: 'text', content: userText }],
    timestamp: Date.now(),
  };
}

function makeAssistantMessage(): CopilotMessage {
  return { id: crypto.randomUUID(), role: 'assistant', blocks: [], timestamp: Date.now() };
}

function getWordCount(block: CopilotMessageBlock): number {
  if (block.type !== 'text') return 0;
  return block.content.split(' ').length;
}

function buildPartialTextBlock(block: CopilotTextBlock, wordIndex: number): CopilotTextBlock {
  const words = block.content.split(' ');
  return { type: 'text', content: words.slice(0, wordIndex + 1).join(' ') };
}

function buildPartialBlocks(state: StreamState): CopilotMessageBlock[] {
  const { targetBlocks, currentBlocks, blockIndex, wordIndex } = state;
  const block = targetBlocks[blockIndex];
  if (!block) return currentBlocks;

  if (block.type === 'action') {
    return [...currentBlocks, block];
  }

  const partial = buildPartialTextBlock(block, wordIndex);
  return [...currentBlocks.slice(0, currentBlocks.length), partial];
}

function advanceStreamState(state: StreamState): StreamState {
  const { targetBlocks, currentBlocks, blockIndex, wordIndex } = state;
  const block = targetBlocks[blockIndex];
  if (!block) return state;

  if (block.type === 'action') {
    return {
      targetBlocks,
      currentBlocks: [...currentBlocks, block],
      blockIndex: blockIndex + 1,
      wordIndex: 0,
    };
  }

  const totalWords = getWordCount(block);
  const isLastWord = wordIndex >= totalWords - 1;

  if (isLastWord) {
    const finishedBlock: CopilotTextBlock = { type: 'text', content: block.content };
    return {
      targetBlocks,
      currentBlocks: [...currentBlocks, finishedBlock],
      blockIndex: blockIndex + 1,
      wordIndex: 0,
    };
  }

  return { targetBlocks, currentBlocks, blockIndex, wordIndex: wordIndex + 1 };
}

function isStreamComplete(state: StreamState): boolean {
  return state.blockIndex >= state.targetBlocks.length;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCopilotStreaming(
  addMessage: (message: CopilotMessage) => void,
  updateLastMessage: (blocks: CopilotMessage['blocks']) => void
): UseCopilotStreamingReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<StreamState>({
    blockIndex: 0,
    wordIndex: 0,
    targetBlocks: [],
    currentBlocks: [],
  });

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const stopStreaming = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    updateLastMessage(streamRef.current.targetBlocks);
    setIsStreaming(false);
  }, [updateLastMessage]);

  const startStreaming = useCallback(
    (userText: string) => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      addMessage(makeUserMessage(userText));
      const targetBlocks = getNextMockResponse();
      addMessage(makeAssistantMessage());

      streamRef.current = { blockIndex: 0, wordIndex: 0, targetBlocks, currentBlocks: [] };
      setIsStreaming(true);

      intervalRef.current = setInterval(() => {
        const partial = buildPartialBlocks(streamRef.current);
        updateLastMessage(partial);

        streamRef.current = advanceStreamState(streamRef.current);

        if (isStreamComplete(streamRef.current)) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsStreaming(false);
        }
      }, 30);
    },
    [addMessage, updateLastMessage]
  );

  return { isStreaming, startStreaming, stopStreaming };
}
