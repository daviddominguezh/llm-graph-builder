'use client';

import { Button } from '@/components/ui/button';
import { WandSparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { useCopilotContext } from './CopilotProvider';

function isAgentsTab(pathname: string): boolean {
  const match = pathname.match(/^\/orgs\/[^/]+(?:\/(.*))?$/);
  const rest = match?.[1] ?? '';
  const segment = rest.split('/')[0] ?? '';
  return segment === '' || segment === 'editor';
}

export function CopilotButton() {
  const { isOpen, setOpen } = useCopilotContext();
  const pathname = usePathname();

  if (isOpen || !isAgentsTab(pathname)) return null;

  return (
    <div className="fixed bottom-1 right-1 z-100">
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
