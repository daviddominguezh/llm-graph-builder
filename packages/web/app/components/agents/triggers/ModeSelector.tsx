'use client';

import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useState } from 'react';

import type { ScheduleMode } from './types';

interface ModeOption {
  id: ScheduleMode;
  disabled?: boolean;
}

const MODES: ModeOption[] = [{ id: 'recurring' }, { id: 'once' }, { id: 'after-event', disabled: true }];

const PILL_BASE =
  'relative z-10 inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40';
const PILL_ACTIVE = 'text-foreground';
const PILL_INACTIVE = 'text-muted-foreground hover:text-foreground';
const PILL_DISABLED = 'cursor-not-allowed text-muted-foreground/60 hover:text-muted-foreground/60';
const PILL_ENABLED = 'cursor-pointer';

interface IndicatorState {
  left: number;
  width: number;
  ready: boolean;
}

const HIDDEN_INDICATOR: IndicatorState = { left: 0, width: 0, ready: false };

interface ModeSelectorProps {
  value: ScheduleMode;
  onChange: (next: ScheduleMode) => void;
}

function PillButton({
  option,
  active,
  label,
  soonLabel,
  onSelect,
}: {
  option: ModeOption;
  active: boolean;
  label: string;
  soonLabel: string;
  onSelect: () => void;
}) {
  const disabled = Boolean(option.disabled);
  return (
    <button
      type="button"
      data-mode={option.id}
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={active}
      className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_INACTIVE, disabled ? PILL_DISABLED : PILL_ENABLED)}
    >
      {label}
      {disabled && (
        <span className="rounded-sm bg-foreground/10 px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {soonLabel}
        </span>
      )}
    </button>
  );
}

function useActiveIndicator(value: ScheduleMode, container: HTMLDivElement | null): IndicatorState {
  const [indicator, setIndicator] = useState<IndicatorState>(HIDDEN_INDICATOR);
  useLayoutEffect(() => {
    if (!container) return;
    const target = container.querySelector<HTMLButtonElement>(`[data-mode="${value}"]`);
    if (!target) return;
    const cRect = container.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    setIndicator({ left: tRect.left - cRect.left, width: tRect.width, ready: true });
  }, [value, container]);
  return indicator;
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const t = useTranslations('editor.triggers.mode');
  const tCommon = useTranslations('editor.triggers');
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const indicator = useActiveIndicator(value, container);
  return (
    <div
      ref={setContainer}
      className="relative inline-flex w-fit items-center gap-0.5 rounded-lg bg-input p-0.5"
    >
      <div
        aria-hidden
        className="absolute top-0.5 bottom-0.5 rounded-md bg-background shadow-xs transition-[left,width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{ left: indicator.left, width: indicator.width, opacity: indicator.ready ? 1 : 0 }}
      />
      {MODES.map((option) => (
        <PillButton
          key={option.id}
          option={option}
          active={option.id === value}
          label={t(option.id)}
          soonLabel={tCommon('soon')}
          onSelect={() => !option.disabled && onChange(option.id)}
        />
      ))}
    </div>
  );
}
