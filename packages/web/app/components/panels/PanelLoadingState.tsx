'use client';

import { Loader2 } from 'lucide-react';

export function PanelLoadingState(): React.JSX.Element {
  return (
    <div className="flex flex-1 min-h-0 items-center justify-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}
