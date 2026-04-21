import { ChevronDown, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu.js';

export type ChatTitleMenuTriggerIcon = 'chevron' | 'dots';

export interface ChatTitleMenuProps {
  starred: boolean;
  onRename: () => void;
  onToggleStar: () => void;
  onRequestDelete: () => void;
  triggerIcon?: ChatTitleMenuTriggerIcon;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function StarItem({ starred, onToggleStar }: { starred: boolean; onToggleStar: () => void }) {
  const t = useT();
  const label = starred ? t('unmarkStar') : t('markWithStar');
  return (
    <DropdownMenuItem onClick={onToggleStar}>
      <Star className={starred ? 'fill-current' : undefined} />
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function renderTriggerIcon(icon: ChatTitleMenuTriggerIcon): ReactNode {
  return icon === 'dots' ? <MoreHorizontal /> : <ChevronDown />;
}

interface TriggerButtonProps {
  icon: ChatTitleMenuTriggerIcon;
  label: string;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function TriggerButton({ icon, label, className, onClick }: TriggerButtonProps) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} className={className} onClick={onClick}>
      {renderTriggerIcon(icon)}
    </Button>
  );
}

export function ChatTitleMenu({
  starred,
  onRename,
  onToggleStar,
  onRequestDelete,
  triggerIcon = 'chevron',
  open,
  onOpenChange,
  triggerClassName,
  onTriggerClick,
}: ChatTitleMenuProps) {
  const t = useT();
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <TriggerButton
            icon={triggerIcon}
            label={t('titleMenu')}
            className={triggerClassName}
            onClick={onTriggerClick}
          />
        }
      />
      <DropdownMenuContent align="start" sideOffset={6}>
        <StarItem starred={starred} onToggleStar={onToggleStar} />
        <DropdownMenuItem onClick={onRename}>
          <Pencil />
          <span>{t('rename')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onRequestDelete} className="text-destructive">
          <Trash2 />
          <span>{t('delete')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
