'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MessageStep } from './MessageStep';
import { ScheduleStep } from './ScheduleStep';
import { StepFooter } from './StepFooter';
import type { TriggerFormState } from './types';

interface TriggerFormDialogProps {
  open: boolean;
  isEdit: boolean;
  initial: TriggerFormState;
  onOpenChange: (open: boolean) => void;
  onSave: (form: TriggerFormState) => void;
}

type WizardStep = 'schedule' | 'message';

interface FormBodyProps {
  initial: TriggerFormState;
  isEdit: boolean;
  onSave: (form: TriggerFormState) => void;
  onCancel: () => void;
}

function FormBody({ initial, isEdit, onSave, onCancel }: FormBodyProps) {
  const t = useTranslations('editor.triggers');
  const [state, setState] = useState<TriggerFormState>(initial);
  const [step, setStep] = useState<WizardStep>('schedule');
  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? t('modalEdit') : t('modalAdd')}</DialogTitle>
      </DialogHeader>
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1" data-native-scroll>
        {step === 'schedule' ? (
          <ScheduleStep state={state} setState={setState} />
        ) : (
          <MessageStep
            value={state.initialMessage}
            onChange={(v) => setState({ ...state, initialMessage: v })}
          />
        )}
      </div>
      <StepFooter
        step={step}
        messageEmpty={state.initialMessage.trim() === ''}
        onCancel={onCancel}
        onNext={() => setStep('message')}
        onBack={() => setStep('schedule')}
        onSave={() => onSave(state)}
      />
    </>
  );
}

export function TriggerFormDialog(props: TriggerFormDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[450px] flex flex-col">
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
