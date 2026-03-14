'use client';

import { Button } from '@/components/ui/button';
import { WandSparkles } from 'lucide-react';

import { useCopilotContext } from './CopilotProvider';

export function CopilotButton() {
  const { isOpen, setOpen } = useCopilotContext();

  if (isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Button
        variant="default"
        size="sm"
        className="h-12 w-12 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
      >
        <WandSparkles className="size-5" />
      </Button>
    </div>
  );
}
