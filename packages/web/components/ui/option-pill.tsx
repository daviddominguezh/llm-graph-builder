'use client';
import { cn } from '@/lib/utils';
import type { KeyboardEvent } from 'react';

type PillVariant = 'single' | 'multi';

interface OptionPillProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  variant?: PillVariant;
}

function handlePillKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
  if (e.key !== 'Enter') return;
  // Default button behavior fires click() on Enter, which toggles the pill.
  // For ARIA radio/checkbox semantics, Space handles toggle; Enter should
  // submit the enclosing form instead.
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}

export function OptionPill({ label, checked, onToggle, variant = 'single' }: OptionPillProps) {
  return (
    <button
      type="button"
      role={variant === 'single' ? 'radio' : 'checkbox'}
      aria-checked={checked}
      onClick={onToggle}
      onKeyDown={handlePillKeyDown}
      className={cn(
        'inline-flex h-6 cursor-pointer items-center rounded-sm px-1.5 text-xs outline-none',
        'transition-[background-color,color,transform] duration-150 active:scale-[0.96]',
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
