'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');

  if (resolvedTheme === undefined) return null;

  const isLight = resolvedTheme === 'light';

  return (
    <div role="group" aria-label={t('appearance')} className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className={cn('rounded-sm', isLight ? 'bg-background shadow-sm hover:bg-background' : 'text-muted-foreground')}
        onClick={() => setTheme('light')}
        aria-label={t('light')}
        aria-pressed={isLight}
      >
        <Sun className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn('rounded-sm', !isLight ? 'bg-background shadow-sm hover:bg-background' : 'text-muted-foreground')}
        onClick={() => setTheme('dark')}
        aria-label={t('dark')}
        aria-pressed={!isLight}
      >
        <Moon className="size-4" />
      </Button>
    </div>
  );
}
