'use client';

import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

function subscribe(): () => void {
  return () => {};
}

function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');
  const mounted = useIsMounted();

  if (!mounted) return null;

  const isLight = resolvedTheme === 'light';

  return (
    <div role="group" aria-label={t('appearance')} className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        className={cn('rounded-sm', isLight ? 'bg-background hover:bg-background shadow-sm' : 'dark:hover:bg-card text-muted-foreground')}
        onClick={() => setTheme('light')}
        aria-label={t('light')}
        aria-pressed={isLight}
      >
        <Sun className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className={cn('rounded-sm', !isLight ? 'dark:bg-input hover:bg-card bg-background hover:bg-background shadow-sm' : 'text-muted-foreground')}
        onClick={() => setTheme('dark')}
        aria-label={t('dark')}
        aria-pressed={!isLight}
      >
        <Moon className="size-4" />
      </Button>
    </div>
  );
}
