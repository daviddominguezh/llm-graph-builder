import { PanelLeft } from 'lucide-react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';
import { ChatHeader } from './ChatHeader.js';
import { ThemeToggle } from './ThemeToggle.js';

export interface TopBarProps {
  title?: string;
  sessionId?: string;
  starred?: boolean;
  bordered?: boolean;
  onRename?: (id: string, newTitle: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string) => void;
  onOpenSidebar?: () => void;
}

function ReopenSidebarButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      <PanelLeft />
    </Button>
  );
}

interface HeaderSlotProps {
  title?: string;
  sessionId?: string;
  starred?: boolean;
  onRename?: (id: string, newTitle: string) => void;
  onDelete?: (id: string) => void;
  onToggleStar?: (id: string) => void;
}

function HeaderSlot(props: HeaderSlotProps) {
  const { title, sessionId, starred, onRename, onDelete, onToggleStar } = props;
  if (title === undefined || sessionId === undefined) return null;
  return (
    <ChatHeader
      title={title}
      starred={starred === true}
      onRename={(t) => onRename?.(sessionId, t)}
      onDelete={() => onDelete?.(sessionId)}
      onToggleStar={() => onToggleStar?.(sessionId)}
    />
  );
}

export function TopBar(props: TopBarProps) {
  const t = useT();
  const { onOpenSidebar, ...rest } = props;

  return (
    <div className={`h-12 shrink-0 bg-sidebar`}>
      <div className="h-full max-w-4xl mx-auto w-full px-0 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {onOpenSidebar !== undefined && (
            <ReopenSidebarButton onClick={onOpenSidebar} label={t('collapseSidebar')} />
          )}
          <HeaderSlot {...rest} />
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
