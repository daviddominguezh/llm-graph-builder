'use client';

import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';

import { ModeSelector } from './ModeSelector';
import { NextRunPreview } from './NextRunPreview';
import { OnceField } from './OnceField';
import { RecurringFields } from './RecurringFields';
import type { TriggerFormState } from './types';

interface ScheduleStepProps {
  state: TriggerFormState;
  setState: (next: TriggerFormState) => void;
}

function AfterEventNote() {
  const t = useTranslations('editor.triggers');
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {t('afterEventComingSoon')}
    </div>
  );
}

function ActiveContent({ state, setState }: ScheduleStepProps) {
  if (state.mode === 'recurring') {
    return (
      <RecurringFields value={state.recurring} onChange={(recurring) => setState({ ...state, recurring })} />
    );
  }
  if (state.mode === 'once') {
    return (
      <OnceField
        value={state.onceDateTime}
        onChange={(onceDateTime) => setState({ ...state, onceDateTime })}
      />
    );
  }
  return <AfterEventNote />;
}

function PreviewSection({ state }: { state: TriggerFormState }) {
  if (state.mode !== 'recurring') return null;
  return (
    <>
      <Separator />
      <NextRunPreview state={state} />
    </>
  );
}

export function ScheduleStep({ state, setState }: ScheduleStepProps) {
  const t = useTranslations('editor.triggers');
  return (
    <div className="flex flex-col gap-2.5">
      <ModeSelector value={state.mode} onChange={(mode) => setState({ ...state, mode })} />
      <Separator />
      <div className="flex gap-x-3">
        <span className="shrink-0 text-xs font-medium text-foreground invisible">{t('modeLabel')}</span>
        <div className="flex-1 flex flex-col gap-2.5">
          <ActiveContent state={state} setState={setState} />
          <PreviewSection state={state} />
        </div>
      </div>
    </div>
  );
}
