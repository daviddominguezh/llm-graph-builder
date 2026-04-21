import { ChevronDown } from 'lucide-react';

import { ThemeToggle } from './ThemeToggle.js';
import { VersionHistoryButton } from './VersionHistoryButton.js';

export interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <div className="h-12 border-b border-border px-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-sm font-medium truncate">{title}</span>
        <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
      </div>
      <div className="flex items-center gap-1">
        <VersionHistoryButton />
        <ThemeToggle />
      </div>
    </div>
  );
}
