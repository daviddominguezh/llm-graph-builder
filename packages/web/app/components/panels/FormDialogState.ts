'use client';

import type { OutputSchemaEntity, OutputSchemaField } from '@daviddh/graph-types';
import { collectFieldPaths, type ValidationsMap } from '@daviddh/llm-graph-runner';
import type { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { createFormAction, getFormAction, updateFormValidationsAction } from '@/app/actions/forms';

export type FormDialogMode = { mode: 'create' } | { mode: 'edit'; formId: string };

export type FormDialogStep = 'name' | 'validations';

export const STEP_NAME: FormDialogStep = 'name';
export const STEP_VALIDATIONS: FormDialogStep = 'validations';

const STEP_ORDER: readonly FormDialogStep[] = [STEP_NAME, STEP_VALIDATIONS];
export const TOTAL_STEPS = STEP_ORDER.length;

export function stepIndex(step: FormDialogStep): number {
  return STEP_ORDER.indexOf(step) + 1;
}

export interface Step1State {
  name: string;
  slug: string;
  schemaId: string | null;
  isNameSlugValid: boolean;
}

export const EMPTY_STEP1: Step1State = {
  name: '',
  slug: '',
  schemaId: null,
  isNameSlugValid: false,
};

export interface FormDialogStateBundle {
  step: FormDialogStep;
  setStep: (s: FormDialogStep) => void;
  step1: Step1State;
  setStep1: (s: Step1State) => void;
  validations: ValidationsMap;
  setValidations: (v: ValidationsMap) => void;
  staleKept: boolean;
  setStaleKept: (b: boolean) => void;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  dirty: boolean;
  setDirty: (b: boolean) => void;
}

export function useFormDialogState(): FormDialogStateBundle {
  const [step, setStep] = useState<FormDialogStep>(STEP_NAME);
  const [step1, setStep1] = useState<Step1State>(EMPTY_STEP1);
  const [validations, setValidations] = useState<ValidationsMap>({});
  const [staleKept, setStaleKept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  return {
    step,
    setStep,
    step1,
    setStep1,
    validations,
    setValidations,
    staleKept,
    setStaleKept,
    submitting,
    setSubmitting,
    dirty,
    setDirty,
  };
}

export function useFormDialogContentRef(): RefObject<HTMLDivElement | null> {
  return useRef<HTMLDivElement | null>(null);
}

interface HydrateArgs {
  open: boolean;
  mode: FormDialogMode;
  setStep1: (s: Step1State) => void;
  setValidations: (v: ValidationsMap) => void;
}

export function useHydrateOnEditOpen({ open, mode, setStep1, setValidations }: HydrateArgs): void {
  useEffect(() => {
    if (!open || mode.mode !== 'edit') return;
    void getFormAction(mode.formId).then((d) => {
      if (d === null) return;
      setStep1({ name: d.displayName, slug: d.slug, schemaId: d.schemaId, isNameSlugValid: true });
      setValidations(d.validations);
    });
  }, [open, mode, setStep1, setValidations]);
}

interface ResetArgs {
  open: boolean;
  setStep: (s: FormDialogStep) => void;
  setStep1: (s: Step1State) => void;
  setValidations: (v: ValidationsMap) => void;
  setStaleKept: (b: boolean) => void;
  setSubmitting: (b: boolean) => void;
  setDirty: (b: boolean) => void;
}

export function useResetOnClose({
  open,
  setStep,
  setStep1,
  setValidations,
  setStaleKept,
  setSubmitting,
  setDirty,
}: ResetArgs): void {
  useEffect(() => {
    if (open) return;
    setStep(STEP_NAME);
    setStep1(EMPTY_STEP1);
    setValidations({});
    setStaleKept(false);
    setSubmitting(false);
    setDirty(false);
  }, [open, setStep, setStep1, setValidations, setStaleKept, setSubmitting, setDirty]);
}

interface FocusArgs {
  open: boolean;
  step: FormDialogStep;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function useInitialFocus({ open, step, contentRef }: FocusArgs): void {
  useEffect(() => {
    if (!open) return;
    const { current: root } = contentRef;
    if (root === null) return;
    const target =
      step === STEP_NAME
        ? root.querySelector<HTMLInputElement>('#form-name')
        : root.querySelector<HTMLElement>('button, [role="combobox"], input');
    target?.focus();
  }, [open, step, contentRef]);
}

interface KeyArgs {
  step: FormDialogStep;
  canNext: boolean;
  canSubmit: boolean;
  setStep: (s: FormDialogStep) => void;
  submit: () => void;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function handleKey(e: KeyboardEvent<HTMLDivElement>, a: KeyArgs): void {
  if (tryAdvanceOnEnter(e, a)) return;
  if (trySubmitOnModEnter(e, a)) return;
  if (e.key === '/' && a.step === STEP_VALIDATIONS) {
    focusValidationsSearch(e, a.contentRef);
  }
}

function tryAdvanceOnEnter(e: KeyboardEvent<HTMLDivElement>, a: KeyArgs): boolean {
  const isPlainEnter = e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey;
  if (!isPlainEnter || a.step !== STEP_NAME || !a.canNext) return false;
  e.preventDefault();
  a.setStep(STEP_VALIDATIONS);
  return true;
}

function trySubmitOnModEnter(e: KeyboardEvent<HTMLDivElement>, a: KeyArgs): boolean {
  const isModEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
  if (!isModEnter || a.step !== STEP_VALIDATIONS || !a.canSubmit) return false;
  e.preventDefault();
  a.submit();
  return true;
}

function focusValidationsSearch(
  e: KeyboardEvent<HTMLDivElement>,
  contentRef: RefObject<HTMLDivElement | null>
): void {
  const input = contentRef.current?.querySelector<HTMLInputElement>('input[placeholder]');
  if (input === null || input === undefined) return;
  e.preventDefault();
  input.focus();
}

export interface BodyArgs {
  step: FormDialogStep;
  mode: FormDialogMode;
  schemas: OutputSchemaEntity[];
  agentId: string;
  step1: Step1State;
  setStep1: (s: Step1State) => void;
  setDirty: (d: boolean) => void;
  selectedSchema: OutputSchemaEntity | undefined;
  validations: ValidationsMap;
  stalePaths: string[];
  staleKept: boolean;
  setStaleKept: (b: boolean) => void;
  setValidations: (v: ValidationsMap) => void;
}

export interface FooterArgs {
  step: FormDialogStep;
  mode: FormDialogMode;
  canNext: boolean;
  canSubmit: boolean;
  submitting: boolean;
  setStep: (s: FormDialogStep) => void;
  submit: () => void;
  handleOpenChange: (next: boolean) => void;
  t: ReturnType<typeof useTranslations>;
}

export async function runSubmit(
  mode: FormDialogMode,
  agentId: string,
  step1: Step1State,
  validations: ValidationsMap
): Promise<void> {
  if (mode.mode === 'create') {
    if (step1.schemaId === null) return;
    await createFormAction({
      agentId,
      displayName: step1.name,
      slug: step1.slug,
      schemaId: step1.schemaId,
      validations,
    });
    return;
  }
  await updateFormValidationsAction(mode.formId, validations);
}

export function computeStale(fields: OutputSchemaField[], validations: ValidationsMap): string[] {
  const canonical = new Set(collectFieldPaths(fields));
  return Object.keys(validations).filter((p) => !canonical.has(p));
}
