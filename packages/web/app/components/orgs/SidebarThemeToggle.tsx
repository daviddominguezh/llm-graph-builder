'use client';

import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

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

interface SidebarThemeToggleProps {
  collapsed: boolean;
}

interface ToggleVariantProps {
  isLight: boolean;
  onToggle: () => void;
  ariaLabel: string;
  label: string;
}

function CollapsedToggle({ isLight, onToggle, ariaLabel }: Omit<ToggleVariantProps, 'label'>) {
  const Icon = isLight ? Moon : Sun;

  return (
    <div className="cursor-pointer group flex flex-col justify-center items-center p-0 w-full aspect-square rounded-[5px] hover:bg-sidebar-accent">
      <Button
        variant="ghost"
        className="h-5 aspect-square w-full justify-start p-0! border-x-0 border-y-0 rounded-none group-hover:bg-transparent! border-l border-l-2 group-hover:border-transparent text-muted-foreground group-hover:text-foreground!"
        render={
          <button
            type="button"
            className="border-none w-full h-full p-0 m-0 flex! items-center! justify-center!"
            onClick={onToggle}
            aria-label={ariaLabel}
          />
        }
      >
        <Icon />
      </Button>
    </div>
  );
}

function ExpandedToggle({ isLight, onToggle, ariaLabel, label }: ToggleVariantProps) {
  const Icon = isLight ? Moon : Sun;

  return (
    <div className="cursor-pointer group flex flex-col justify-center py-1 rounded-[5px] hover:bg-sidebar-accent">
      <Button
        variant="ghost"
        size="sm"
        aria-label={ariaLabel}
        onClick={onToggle}
        className="h-6 w-full justify-start gap-2 px-2 text-sm border-x-0 border-y-0 rounded-none border-l border-l-2 group-hover:border-foreground text-muted-foreground hover:text-foreground hover:bg-transparent!"
      >
        <Icon className="size-4" />
        <span className="whitespace-nowrap font-normal">{label}</span>
      </Button>
    </div>
  );
}

export function SidebarThemeToggle({ collapsed }: SidebarThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');
  const mounted = useIsMounted();

  if (!mounted) return null;

  const isLight = resolvedTheme === 'light';
  const ariaLabel = isLight ? t('dark') : t('light');
  const onToggle = () => setTheme(isLight ? 'dark' : 'light');

  if (collapsed) {
    return <CollapsedToggle isLight={isLight} onToggle={onToggle} ariaLabel={ariaLabel} />;
  }

  return <ExpandedToggle isLight={isLight} onToggle={onToggle} ariaLabel={ariaLabel} label={t('label')} />;
}
