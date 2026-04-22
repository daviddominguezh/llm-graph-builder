'use client';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

type PillVariant = 'single' | 'multi';

interface OptionPillProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
  variant?: PillVariant;
}

export function OptionPill({ label, checked, onToggle, variant = 'single' }: OptionPillProps) {
  const showCheck = checked && variant === 'multi';
  return (
    <button
      type="button"
      role={variant === 'single' ? 'radio' : 'checkbox'}
      aria-checked={checked}
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'cursor-pointer inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs transition-colors',
        !checked && 'bg-background text-muted-foreground hover:text-foreground/80',
        checked && variant === 'single' && 'bg-foreground text-background',
        checked && variant === 'multi' && 'bg-input text-foreground'
      )}
    >
      {showCheck && <Check className="-ml-0.5 size-3" aria-hidden />}
      {label}
    </button>
  );
}
