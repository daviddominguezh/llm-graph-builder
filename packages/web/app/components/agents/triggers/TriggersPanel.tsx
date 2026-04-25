'use client';

import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ModeSelector } from './ModeSelector';
import { NextRunPreview } from './NextRunPreview';
import { OnceField } from './OnceField';
import { RecurringFields } from './RecurringFields';
import type { TriggerFormState } from './types';
import { DEFAULT_TRIGGER_STATE } from './types';

interface SectionProps {
  state: TriggerFormState;
  setState: (next: TriggerFormState) => void;
}

function TriggersHeader() {
  const t = useTranslations('editor.triggers');
  return (
    <header className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold tracking-tight">{t('title')}</h2>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
    </header>
  );
}

function AfterEventNote() {
  const t = useTranslations('editor.triggers');
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      {t('afterEventComingSoon')}
    </div>
  );
}

function PreviewSection({ state }: { state: TriggerFormState }) {
  if (state.mode === 'after-event') return null;
  return (
    <div className="flex flex-col gap-3">
      <Separator />
      <NextRunPreview state={state} />
    </div>
  );
}

function ActiveModeContent({ state, setState }: SectionProps) {
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

function ActiveModePanel({ state, setState }: SectionProps) {
  return (
    <div
      key={state.mode}
      className="animate-in fade-in slide-in-from-top-1 duration-200 ease-out motion-reduce:animate-none"
    >
      <ActiveModeContent state={state} setState={setState} />
    </div>
  );
}

export function TriggersPanel() {
  const [state, setState] = useState<TriggerFormState>(DEFAULT_TRIGGER_STATE);
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-6">
        <div className="flex flex-col gap-3">
          <TriggersHeader />
          <ModeSelector value={state.mode} onChange={(mode) => setState({ ...state, mode })} />
        </div>
        <ActiveModePanel state={state} setState={setState} />
        <PreviewSection state={state} />
      </div>
    </div>
  );
}
