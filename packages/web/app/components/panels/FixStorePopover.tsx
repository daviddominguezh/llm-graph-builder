'use client';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import type React from 'react';
import { useState } from 'react';

import { StoreSelect, type StoreSelectStore } from './StoreSelect';

export interface FixStorePopoverProps {
  trigger: React.ReactNode;
  storeKind: 'kv' | 'rag';
  stores: StoreSelectStore[];
  currentSelectedId: string | null;
  onConfirm: (next: string | null) => void;
  onCancel?: () => void;
}

function getCopy(storeKind: 'kv' | 'rag'): { title: string; placeholder: string } {
  if (storeKind === 'kv') {
    /* i18n: agentTools.fixPopoverTitle */
    return { title: 'Select a KV store', placeholder: 'Select KV store' };
  }
  /* i18n: agentTools.fixPopoverTitle */
  return { title: 'Select a RAG store', placeholder: 'Select RAG store' };
}

export function FixStorePopover(props: FixStorePopoverProps): React.JSX.Element {
  const { trigger, storeKind, stores, currentSelectedId, onConfirm, onCancel } = props;
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(currentSelectedId);
  const copy = getCopy(storeKind);

  const handleOpenChange = (next: boolean): void => {
    setOpen(next);
    if (next) setPendingId(currentSelectedId);
  };

  const handleCancel = (): void => {
    onCancel?.();
    setOpen(false);
  };

  const handleConfirm = (): void => {
    onConfirm(pendingId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger as React.ReactElement} />
      <PopoverContent className="w-72" align="end">
        <PopoverHeader>
          <PopoverTitle>{copy.title}</PopoverTitle>
          <PopoverDescription>
            {/* i18n: agentTools.fixPopoverDescription */}
            Tools in this group need a store to operate on. You can change this later in the tools panel.
          </PopoverDescription>
        </PopoverHeader>
        <StoreSelect
          stores={stores}
          selectedId={pendingId}
          saveState="idle"
          onChange={setPendingId}
          placeholder={copy.placeholder}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {/* i18n: agentTools.fixPopoverCancel */}
            Cancel
          </Button>
          <Button variant="default" size="sm" onClick={handleConfirm}>
            {/* i18n: agentTools.fixPopoverConfirm */}
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
