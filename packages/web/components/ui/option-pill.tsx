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
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'cursor-pointer inline-flex h-6 items-center rounded-sm px-1.5 text-xs transition-colors',
        checked
          ? 'bg-foreground text-background'
          : 'bg-background text-muted-foreground hover:text-foreground/80'
      )}
    >
      {label}
    </button>
  );
}
