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

import { SingleEdgePreview } from './MiniGraphPreview';

interface UserNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  onCreate: (userSaidValue: string) => void;
}

export function UserNodeDialog({ open, onOpenChange, sourceNodeLabel, onCreate }: UserNodeDialogProps) {
  const t = useTranslations('connectionMenu');
  const [value, setValue] = useState('');

  const handleCreate = () => {
    onCreate(value.trim());
    setValue('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setValue('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createUserNode')}</DialogTitle>
        </DialogHeader>
        <SingleEdgePreview sourceLabel={sourceNodeLabel} color="green" />
        <div className="space-y-2 px-1">
          <Label className="text-xs">{t('whenUserSays')}</Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() !== '') handleCreate(); }}
            placeholder={t('userSaysPlaceholder')}
            className="h-8 text-xs"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={value.trim() === ''} className="active:scale-[0.97] transition-transform">
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
