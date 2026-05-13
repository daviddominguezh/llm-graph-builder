'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ModeSelector } from './ModeSelector';
import { NextRunPreview } from './NextRunPreview';
import { OnceField } from './OnceField';
import { RecurringFields } from './RecurringFields';
import type { TriggerFormState } from './types';

interface TriggerFormDialogProps {
  open: boolean;
  isEdit: boolean;
  initial: TriggerFormState;
  onOpenChange: (open: boolean) => void;
  onSave: (form: TriggerFormState) => void;
}

interface FormProps {
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

function ActiveContent({ state, setState }: FormProps) {
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
  if (state.mode === 'after-event') return null;
  return (
    <>
      <Separator />
      <NextRunPreview state={state} />
    </>
  );
}

interface FormBodyProps {
  initial: TriggerFormState;
  isEdit: boolean;
  onSave: (form: TriggerFormState) => void;
  onCancel: () => void;
}

function FormBody({ initial, isEdit, onSave, onCancel }: FormBodyProps) {
  const t = useTranslations('editor.triggers');
  const [state, setState] = useState<TriggerFormState>(initial);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? t('modalEdit') : t('modalAdd')}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <ModeSelector value={state.mode} onChange={(mode) => setState({ ...state, mode })} />
        <ActiveContent state={state} setState={setState} />
        <PreviewSection state={state} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} className="rounded-md">
          {t('cancel')}
        </Button>
        <Button onClick={() => onSave(state)} className="rounded-md">
          {t('save')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function TriggerFormDialog(props: TriggerFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open && (
          <FormBody
            initial={props.initial}
            isEdit={props.isEdit}
            onSave={(form) => {
              props.onSave(form);
              props.onOpenChange(false);
            }}
            onCancel={() => props.onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
