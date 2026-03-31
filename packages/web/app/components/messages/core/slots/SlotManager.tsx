import React, { createContext, useContext, useState, useCallback } from 'react';

export interface UISlot<TProps = Record<string, unknown>> {
  id: string;
  component: React.ComponentType<TProps>;
  priority?: number; // Higher priority = rendered first
  props?: TProps;
  replace?: boolean; // If true, replaces default content instead of adding
}

interface SlotManagerContextValue {
  registerSlot: (slotName: string, slot: UISlot) => void;
  unregisterSlot: (slotName: string, slotId: string) => void;
  getSlots: (slotName: string) => UISlot[];
  hasSlots: (slotName: string) => boolean;
}

const SlotManagerContext = createContext<SlotManagerContextValue | undefined>(undefined);

export const SlotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [slots, setSlots] = useState<Record<string, UISlot[]>>({});

  const registerSlot = useCallback((slotName: string, slot: UISlot) => {
    setSlots((prev) => {
      const currentSlots = prev[slotName] || [];

      // Check if slot already exists
      const existingIndex = currentSlots.findIndex((s) => s.id === slot.id);

      let newSlots: UISlot[];
      if (existingIndex >= 0) {
        // Update existing slot
        newSlots = [...currentSlots];
        newSlots[existingIndex] = slot;
      } else {
        // Add new slot
        newSlots = [...currentSlots, slot];
      }

      // Sort by priority (higher first)
      newSlots.sort((a, b) => (b.priority || 0) - (a.priority || 0));

      return {
        ...prev,
        [slotName]: newSlots,
      };
    });
  }, []);

  const unregisterSlot = useCallback((slotName: string, slotId: string) => {
    setSlots((prev) => {
      const currentSlots = prev[slotName] || [];
      const newSlots = currentSlots.filter((s) => s.id !== slotId);

      if (newSlots.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [slotName]: _, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [slotName]: newSlots,
      };
    });
  }, []);

  const getSlots = useCallback(
    (slotName: string): UISlot[] => {
      return slots[slotName] || [];
    },
    [slots]
  );

  const hasSlots = useCallback(
    (slotName: string): boolean => {
      return (slots[slotName] || []).length > 0;
    },
    [slots]
  );

  const value: SlotManagerContextValue = {
    registerSlot,
    unregisterSlot,
    getSlots,
    hasSlots,
  };

  return <SlotManagerContext.Provider value={value}>{children}</SlotManagerContext.Provider>;
};

export const useSlotManager = (): SlotManagerContextValue => {
  const context = useContext(SlotManagerContext);
  if (!context) {
    throw new Error('useSlotManager must be used within a SlotProvider');
  }
  return context;
};
