'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { IfElsePreview } from './MiniGraphPreview';

interface IfElseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  onCreate: (branchAValue: string, branchBValue: string) => void;
}

export function IfElseDialog({ open, onOpenChange, sourceNodeLabel, onCreate }: IfElseDialogProps) {
  const t = useTranslations('connectionMenu');
  const [branchA, setBranchA] = useState('');
  const [branchB, setBranchB] = useState('');

  const handleCreate = () => {
    onCreate(branchA.trim(), branchB.trim());
    setBranchA('');
    setBranchB('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setBranchA('');
    setBranchB('');
    onOpenChange(false);
  };

  const canCreate = branchA.trim() !== '' && branchB.trim() !== '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createIfElse')}</DialogTitle>
        </DialogHeader>
        <IfElsePreview sourceLabel={sourceNodeLabel} />
        <div className="space-y-4 px-1">
          <div className="space-y-2">
            <Label className="text-xs">{t('branchA')}</Label>
            <Input
              value={branchA}
              onChange={(e) => setBranchA(e.target.value)}
              placeholder={t('branchAPlaceholder')}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('branchB')}</Label>
            <Input
              value={branchB}
              onChange={(e) => setBranchB(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder={t('branchBPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
