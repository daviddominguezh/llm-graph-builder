'use client';
import { cn } from '@/lib/utils';

type PillVariant = 'single' | 'multi';

interface OptionPillProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  variant?: PillVariant;
}

export function OptionPill({ label, checked, onToggle, variant = 'single' }: OptionPillProps) {
  return (
    <button
      type="button"
      role={variant === 'single' ? 'radio' : 'checkbox'}
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'inline-flex h-6 cursor-pointer items-center rounded-sm px-1.5 text-xs transition-colors duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        checked
          ? 'bg-primary dark:bg-foreground text-background hover:bg-foreground/90'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
