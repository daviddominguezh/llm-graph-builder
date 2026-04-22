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
        'cursor-pointer inline-flex h-6 items-center rounded-sm px-1.5 text-xs transition-colors',
        checked
          ? 'bg-input text-foreground'
          : 'border-border bg-background text-muted-foreground'
      )}
    >
      {label}
    </button>
  );
}
