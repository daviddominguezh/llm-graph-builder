import { ChevronDown, PanelLeft } from 'lucide-react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';
import { ThemeToggle } from './ThemeToggle.js';
import { VersionHistoryButton } from './VersionHistoryButton.js';

export interface TopBarProps {
  title?: string;
  onOpenSidebar?: () => void;
}

function TitleLabel({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="text-sm font-medium truncate">{title}</span>
      <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

function ReopenSidebarButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      <PanelLeft />
    </Button>
  );
}

export function TopBar({ title, onOpenSidebar }: TopBarProps) {
  const t = useT();
  return (
    <div className="h-12 border-b border-border px-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {onOpenSidebar !== undefined && (
          <ReopenSidebarButton onClick={onOpenSidebar} label={t('collapseSidebar')} />
        )}
        {title !== undefined && <TitleLabel title={title} />}
      </div>
      <div className="flex items-center gap-1">
        <VersionHistoryButton />
        <ThemeToggle />
      </div>
    </div>
  );
}
