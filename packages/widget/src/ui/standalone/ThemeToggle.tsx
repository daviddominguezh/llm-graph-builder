import { Moon, Sun } from 'lucide-react';

import { useT } from '../../app/i18nContext.js';
import { useTheme } from '../../app/useTheme.js';
import { Button } from '../primitives/button.js';

export function ThemeToggle() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const Icon = theme === 'dark' ? Sun : Moon;

  return (
    <Button variant="ghost" size="icon" aria-label={t('toggleTheme')} onClick={toggle}>
      <Icon />
    </Button>
  );
}
