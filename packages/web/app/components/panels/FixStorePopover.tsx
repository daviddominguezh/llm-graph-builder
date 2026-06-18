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
import { useTranslations } from 'next-intl';
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

export function FixStorePopover(props: FixStorePopoverProps): React.JSX.Element {
  const { trigger, storeKind, stores, currentSelectedId, onConfirm, onCancel } = props;
  const t = useTranslations('agentTools');
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(currentSelectedId);
  const kindLabel = storeKind === 'kv' ? 'KV' : 'RAG';
  const title = t('fixPopoverTitle', { kind: kindLabel });
  const placeholder = t('selectStoreKind', { kind: kindLabel });

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
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{t('fixPopoverDescription')}</PopoverDescription>
        </PopoverHeader>
        <StoreSelect
          stores={stores}
          selectedId={pendingId}
          saveState="idle"
          onChange={setPendingId}
          placeholder={placeholder}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {t('fixPopoverCancel')}
          </Button>
          <Button variant="default" size="sm" onClick={handleConfirm}>
            {t('fixPopoverConfirm')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
