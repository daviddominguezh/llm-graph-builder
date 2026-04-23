import { PanelLeft, Plus } from 'lucide-react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';
import { ThemeToggle } from './ThemeToggle.js';

export interface SidebarRailProps {
  onExpand: () => void;
  onNewChat: () => void;
}

// Collapsed sidebar: a 48px rail showing only the expand-sidebar, new-chat,
// and theme-toggle icons. Shown on desktop when the user collapses the full
// sidebar.
export function SidebarRail({ onExpand, onNewChat }: SidebarRailProps) {
  const t = useT();
  return (
    <div className="bg-background dark:bg-sidebar flex flex-col h-full py-2 items-center gap-1 bg-red-100 w-full">
      <Button variant="ghost" size="icon" aria-label={t('expandSidebar')} onClick={onExpand}>
        <PanelLeft />
      </Button>
      <Button variant="ghost" size="icon" aria-label={t('newChat')} onClick={onNewChat}>
        <Plus />
      </Button>
      <div className="mt-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
