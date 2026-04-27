'use client';

import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

import { FormDialogStep1 } from './FormDialogStep1';
import { FormDialogStep2 } from './FormDialogStep2';
import { STEP_NAME, STEP_VALIDATIONS, type BodyArgs, type FooterArgs } from './FormDialogState';

export function renderFormDialogBody(a: BodyArgs): ReactElement {
  if (a.step === STEP_NAME) {
    return (
      <FormDialogStep1
        agentId={a.agentId}
        schemas={a.schemas}
        state={a.step1}
        disabled={a.mode.mode === 'edit'}
        onChange={(s) => {
          a.setStep1(s);
          a.setDirty(true);
        }}
      />
    );
  }
  return (
    <FormDialogStep2
      schema={a.selectedSchema?.fields ?? []}
      validations={a.validations}
      stalePaths={a.stalePaths}
      staleKept={a.staleKept}
      onKeepStale={() => a.setStaleKept(true)}
      onChange={(v) => {
        a.setValidations(v);
        a.setDirty(true);
      }}
    />
  );
}

export function renderFormDialogFooter(a: FooterArgs): ReactElement {
  if (a.step === STEP_NAME) {
    return (
      <DialogFooter>
        <Button variant="ghost" onClick={() => a.handleOpenChange(false)}>
          {a.t('cancel')}
        </Button>
        <Button disabled={!a.canNext} onClick={() => a.setStep(STEP_VALIDATIONS)}>
          {a.t('next')}
        </Button>
      </DialogFooter>
    );
  }
  return (
    <DialogFooter>
      <Button variant="ghost" onClick={() => a.setStep(STEP_NAME)}>
        {a.t('back')}
      </Button>
      <Button disabled={!a.canSubmit || a.submitting} onClick={a.submit}>
        {a.mode.mode === 'create' ? a.t('createButton') : a.t('save')}
      </Button>
    </DialogFooter>
  );
}
