import { ChevronDown, Pencil, Star, Trash2 } from 'lucide-react';

import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu.js';

export interface ChatTitleMenuProps {
  starred: boolean;
  onRename: () => void;
  onToggleStar: () => void;
  onRequestDelete: () => void;
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

export function ChatTitleMenu({ starred, onRename, onToggleStar, onRequestDelete }: ChatTitleMenuProps) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t('titleMenu')}>
            <ChevronDown />
          </Button>
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
