'use client';

import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AddFilesButtonProps {
  onAdd: () => void;
  kbdPressed: boolean;
}

function kbdItemClass(pressed: boolean): string {
  const base = 'bg-transparent transition-colors duration-150';
  return pressed ? `${base} text-primary bg-primary/15` : base;
}

export function AddFilesButton({ onAdd, kbdPressed }: AddFilesButtonProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase');
  const kbdClass = kbdItemClass(kbdPressed);
  return (
    <Button
      variant="outline"
      size="sm"
      type="button"
      className="border-[0.5px] rounded-md gap-2"
      onClick={onAdd}
    >
      <Plus className="size-4" />
      {t('addFiles')}
      <KbdGroup>
        <Kbd className={kbdClass}>⌘ + O</Kbd>
      </KbdGroup>
    </Button>
  );
}
