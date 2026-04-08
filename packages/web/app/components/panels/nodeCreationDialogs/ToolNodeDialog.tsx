'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ToolCombobox } from '../ToolCombobox';
import { SingleEdgePreview } from './MiniGraphPreview';

interface ToolNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  onCreate: (toolName: string) => void;
}

export function ToolNodeDialog({
  open,
  onOpenChange,
  sourceNodeLabel,
  onCreate,
}: ToolNodeDialogProps) {
  const t = useTranslations('connectionMenu');
  const [toolName, setToolName] = useState('');

  const handleCreate = () => {
    onCreate(toolName);
    setToolName('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setToolName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createToolNode')}</DialogTitle>
        </DialogHeader>
        <SingleEdgePreview sourceLabel={sourceNodeLabel} color="orange" />
        <div className="space-y-2 px-1">
          <Label className="text-xs">{t('toolToCall')}</Label>
          <ToolCombobox
            value={toolName}
            onValueChange={setToolName}
            placeholder={t('selectTool')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={toolName === ''} className="active:scale-[0.97] transition-transform">
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
