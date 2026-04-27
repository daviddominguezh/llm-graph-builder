'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { useTranslations } from 'next-intl';
import { useCallback, type KeyboardEvent, type ReactElement, type RefObject } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { renderFormDialogBody, renderFormDialogFooter } from './FormDialogRender';
import {
  STEP_NAME,
  TOTAL_STEPS,
  computeStale,
  handleKey,
  runSubmit,
  stepIndex,
  useFormDialogContentRef,
  useFormDialogState,
  useHydrateOnEditOpen,
  useInitialFocus,
  useResetOnClose,
  type FormDialogMode,
  type FormDialogStateBundle,
} from './FormDialogState';

interface Props {
  open: boolean;
  onClose: () => void;
  agentId: string;
  schemas: OutputSchemaEntity[];
  mode: FormDialogMode;
}

export function FormDialog({ open, onClose, agentId, schemas, mode }: Props): ReactElement {
  const t = useTranslations('forms.dialog');
  const state = useFormDialogState();
  const contentRef = useFormDialogContentRef();
  useHydrateOnEditOpen({
    open,
    mode,
    setStep1: state.setStep1,
    setValidations: state.setValidations,
  });
  useResetOnClose({ open, ...state });
  useInitialFocus({ open, step: state.step, contentRef });

  const derived = deriveFormDialog(state, schemas, mode);
  const submit = useCreateSubmit({ state, mode, agentId, onClose, canSubmit: derived.canSubmit });
  const handleOpenChange = useHandleOpenChange({ onClose });

  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    handleKey(e, {
      step: state.step,
      canNext: derived.canNext,
      canSubmit: derived.canSubmit,
      setStep: state.setStep,
      submit,
      contentRef,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl" aria-labelledby="form-dialog-title">
        <FormDialogShell
          state={state}
          contentRef={contentRef}
          mode={mode}
          schemas={schemas}
          agentId={agentId}
          derived={derived}
          submit={submit}
          handleOpenChange={handleOpenChange}
          onKey={onKey}
          t={t}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DerivedState {
  selectedSchema: OutputSchemaEntity | undefined;
  stalePaths: string[];
  canNext: boolean;
  canSubmit: boolean;
}

function deriveFormDialog(
  state: FormDialogStateBundle,
  schemas: OutputSchemaEntity[],
  mode: FormDialogMode
): DerivedState {
  const selectedSchema = schemas.find((sc) => sc.id === state.step1.schemaId);
  const stalePaths = selectedSchema ? computeStale(selectedSchema.fields, state.validations) : [];
  const canNext =
    mode.mode === 'edit' || (state.step1.isNameSlugValid && state.step1.schemaId !== null);
  const canSubmit = stalePaths.length === 0 || state.staleKept;
  return { selectedSchema, stalePaths, canNext, canSubmit };
}

interface SubmitArgs {
  state: FormDialogStateBundle;
  mode: FormDialogMode;
  agentId: string;
  onClose: () => void;
  canSubmit: boolean;
}

function useCreateSubmit({ state, mode, agentId, onClose, canSubmit }: SubmitArgs): () => void {
  return useCallback((): void => {
    if (!canSubmit) return;
    state.setSubmitting(true);
    void runSubmit(mode, agentId, state.step1, state.validations).then(() => {
      state.setSubmitting(false);
      onClose();
    });
  }, [canSubmit, state, mode, agentId, onClose]);
}

interface OpenChangeArgs {
  onClose: () => void;
}

function useHandleOpenChange({ onClose }: OpenChangeArgs): (next: boolean) => void {
  return useCallback(
    (next: boolean): void => {
      if (next) return;
      onClose();
    },
    [onClose]
  );
}

interface ShellProps {
  state: FormDialogStateBundle;
  contentRef: RefObject<HTMLDivElement | null>;
  mode: FormDialogMode;
  schemas: OutputSchemaEntity[];
  agentId: string;
  derived: DerivedState;
  submit: () => void;
  handleOpenChange: (next: boolean) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
  t: ReturnType<typeof useTranslations>;
}

function FormDialogShell(props: ShellProps): ReactElement {
  const { state, contentRef, mode, onKey, t } = props;
  const titleKey = state.step === STEP_NAME ? `${mode.mode}.step1.title` : `${mode.mode}.step2.title`;
  return (
    <div ref={contentRef} onKeyDown={onKey} className="flex flex-col gap-4 outline-none" tabIndex={-1}>
      <DialogHeader>
        <DialogTitle id="form-dialog-title">{t(titleKey)}</DialogTitle>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {t('stepsCount', { step: stepIndex(state.step), total: TOTAL_STEPS })}
        </p>
      </DialogHeader>
      {renderFormDialogBody(buildBodyArgs(props))}
      {renderFormDialogFooter(buildFooterArgs(props))}
    </div>
  );
}

function buildBodyArgs(props: ShellProps): Parameters<typeof renderFormDialogBody>[0] {
  const { state, mode, schemas, agentId, derived } = props;
  return {
    step: state.step,
    mode,
    schemas,
    agentId,
    step1: state.step1,
    setStep1: state.setStep1,
    setDirty: state.setDirty,
    selectedSchema: derived.selectedSchema,
    validations: state.validations,
    stalePaths: derived.stalePaths,
    staleKept: state.staleKept,
    setStaleKept: state.setStaleKept,
    setValidations: state.setValidations,
  };
}

function buildFooterArgs(props: ShellProps): Parameters<typeof renderFormDialogFooter>[0] {
  const { state, mode, derived, submit, handleOpenChange, t } = props;
  return {
    step: state.step,
    mode,
    canNext: derived.canNext,
    canSubmit: derived.canSubmit,
    submitting: state.submitting,
    setStep: state.setStep,
    submit,
    handleOpenChange,
    t,
  };
}
