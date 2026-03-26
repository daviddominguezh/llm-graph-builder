'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { CopilotProvider } from '@/app/components/copilot/CopilotProvider';

interface SlotRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface EditorCacheContextType {
  register: (agentId: string, content: React.ReactNode) => void;
  setActiveEditor: (id: string | null) => void;
  setSlotRect: (rect: SlotRect | null) => void;
}

const EditorCacheContext = createContext<EditorCacheContextType | null>(null);

export function useEditorCache(): EditorCacheContextType {
  const ctx = useContext(EditorCacheContext);
  if (!ctx) throw new Error('useEditorCache must be within EditorCacheProvider');
  return ctx;
}

export function EditorCacheProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Map<string, React.ReactNode>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slotRect, setSlotRect] = useState<SlotRect | null>(null);

  const register = useCallback((agentId: string, content: React.ReactNode) => {
    setEntries((prev) => {
      if (prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.set(agentId, content);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ register, setActiveEditor: setActiveId, setSlotRect }), [register]);

  return (
    <EditorCacheContext.Provider value={value}>
      {children}
      {Array.from(entries.entries()).map(([agentId, content]) => (
        <CachedEditor key={agentId} isVisible={agentId === activeId && slotRect !== null} slotRect={slotRect}>
          {content}
        </CachedEditor>
      ))}
    </EditorCacheContext.Provider>
  );
}

function CachedEditor({
  children,
  isVisible,
  slotRect,
}: {
  children: React.ReactNode;
  isVisible: boolean;
  slotRect: SlotRect | null;
}) {
  return (
    <div
      className={isVisible ? 'fixed z-30' : 'fixed inset-0 -z-[9999] invisible pointer-events-none'}
      style={isVisible && slotRect ? slotRect : undefined}
    >
      <CopilotProvider>{children}</CopilotProvider>
    </div>
  );
}
