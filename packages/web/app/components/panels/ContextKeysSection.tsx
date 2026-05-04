'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface ContextKeysSectionProps {
  keys: string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onRename: (oldKey: string, newKey: string) => void;
}

function ContextKeyRow({
  keyName,
  onRemove,
  onRename,
}: {
  keyName: string;
  onRemove: () => void;
  onRename: (newKey: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input value={keyName} onChange={(e) => onRename(e.target.value)} className="flex-1" />
      <Button variant="ghost" size="icon-xs" onClick={onRemove}>
        <X className="size-3" />
      </Button>
    </div>
  );
}

export function ContextKeysSection({ keys, onAdd, onRemove, onRename }: ContextKeysSectionProps) {
  const t = useTranslations('contextKeys');

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <Label>{t('sectionTitle')}</Label>
        <Button variant="ghost" size="icon-xs" onClick={() => onAdd('')}>
          <Plus className="size-3" />
        </Button>
      </div>
      {keys.length > 0 && (
        <div className="space-y-1">
          {keys.map((key, index) => (
            <ContextKeyRow
              key={index}
              keyName={key}
              onRemove={() => onRemove(key)}
              onRename={(newKey) => onRename(key, newKey)}
            />
          ))}
        </div>
      )}
      <Separator className="mt-3" />
    </div>
  );
}
