'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface ElementRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface PanelInsets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface EditorCacheContextType {
  register: (agentId: string, content: React.ReactNode) => void;
  setActiveEditor: (id: string | null) => void;
  setSlotRect: (rect: ElementRect | null) => void;
  setMainRect: (rect: ElementRect | null) => void;
  setToolbarPortal: (el: HTMLElement | null) => void;
  toolbarPortal: HTMLElement | null;
  isEditorActive: boolean;
  panelInsets: PanelInsets | null;
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
  const [slotRect, setSlotRect] = useState<ElementRect | null>(null);
  const [mainRect, setMainRect] = useState<ElementRect | null>(null);
  const [toolbarPortal, setToolbarPortal] = useState<HTMLElement | null>(null);

  const register = useCallback((agentId: string, content: React.ReactNode) => {
    setEntries((prev) => {
      if (prev.has(agentId)) return prev;
      const next = new Map(prev);
      next.set(agentId, content);
      return next;
    });
  }, []);

  const isEditorActive = activeId !== null && slotRect !== null;

  const panelInsets = useMemo((): PanelInsets | null => {
    if (!mainRect || !slotRect) return null;
    return {
      top: slotRect.top - mainRect.top,
      left: slotRect.left - mainRect.left,
      right: mainRect.left + mainRect.width - (slotRect.left + slotRect.width),
      bottom: mainRect.top + mainRect.height - (slotRect.top + slotRect.height),
    };
  }, [mainRect, slotRect]);

  const value = useMemo(
    () => ({
      register,
      setActiveEditor: setActiveId,
      setSlotRect,
      setMainRect,
      setToolbarPortal,
      toolbarPortal,
      isEditorActive,
      panelInsets,
    }),
    [register, isEditorActive, panelInsets, toolbarPortal]
  );

  return (
    <EditorCacheContext.Provider value={value}>
      {children}
      {Array.from(entries.entries()).map(([agentId, content]) => (
        <CachedEditor key={agentId} isVisible={agentId === activeId && slotRect !== null} mainRect={mainRect}>
          {content}
        </CachedEditor>
      ))}
    </EditorCacheContext.Provider>
  );
}

export function MainContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  const mainRef = useRef<HTMLElement>(null);
  const { setMainRect, isEditorActive } = useEditorCache();

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return undefined;

    const update = () => {
      const r = el.getBoundingClientRect();
      const root = getComputedStyle(document.documentElement);
      const spacingRaw = root.getPropertyValue('--spacing').trim();
      const spacingPx = spacingRaw.endsWith('px')
        ? parseFloat(spacingRaw)
        : parseFloat(spacingRaw) * (parseFloat(root.fontSize) || 16);
      setMainRect({ top: r.top, left: r.left + spacingPx, width: r.width, height: r.height });
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      setMainRect(null);
    };
  }, [setMainRect]);

  return (
    <main ref={mainRef} className={`${className ?? ''} ${isEditorActive ? 'pointer-events-none' : ''}`}>
      {children}
    </main>
  );
}

function CachedEditor({
  children,
  isVisible,
  mainRect,
}: {
  children: React.ReactNode;
  isVisible: boolean;
  mainRect: ElementRect | null;
}) {
  return (
    <div
      className={isVisible ? 'fixed z-0 overflow-hidden rounded-xl' : 'fixed inset-0 -z-[9999] invisible pointer-events-none'}
      style={isVisible && mainRect ? mainRect : undefined}
    >
      {children}
    </div>
  );
}
