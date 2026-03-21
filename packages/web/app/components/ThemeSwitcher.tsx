'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isLight = resolvedTheme === 'light';

  return (
    <div className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5">
      <button
        type="button"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
          isLight ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setTheme('light')}
        aria-label={t('light')}
      >
        <Sun className="size-4" />
      </button>
      <button
        type="button"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
          !isLight ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setTheme('dark')}
        aria-label={t('dark')}
      >
        <Moon className="size-4" />
      </button>
    </div>
  );
}
