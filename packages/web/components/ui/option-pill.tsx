'use client';
import { cn } from '@/lib/utils';

interface OptionPillProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

export function OptionPill({ label, checked, onToggle }: OptionPillProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors',
        checked
          ? 'border-primary bg-primary/10 text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/30'
      )}
    >
      {label}
    </button>
  );
}
