import type {
  ApplyResult,
  FieldApplyResult,
  FormData,
  FormDefinition,
  ValidationRule,
  ValidationsMap,
} from '../../types/forms.js';
import { setAtPath } from './applyFormFieldsSetters.js';
import { normalizePath } from './normalizePath.js';
import { parsePath } from './parsePath.js';
import { runValidation } from './runValidation.js';
import { zodForFieldPath } from './zodForFieldPath.js';

const FIRST_ISSUE = 0;
const ZERO = 0;

export interface ApplyInputField {
  fieldPath: string;
  fieldValue: unknown;
}

export interface ApplyInput {
  form: FormDefinition;
  currentData: FormData | undefined;
  fields: ApplyInputField[];
}

export function applyFormFields(input: ApplyInput): ApplyResult {
  const typeResults = typePass(input);
  if (!typeResults.every(isApplied)) return halt(typeResults, input);

  const ruleResults = rulePass(input);
  if (!ruleResults.every(isApplied)) return halt(ruleResults, input);

  const merged = mergeAll(input.currentData ?? {}, input.fields);
  if (!merged.ok) {
    return { ok: false, newData: input.currentData ?? {}, results: merged.results };
  }
  return { ok: true, newData: merged.data, results: ruleResults };
}

const isApplied = (r: FieldApplyResult): boolean => r.status === 'applied';

function halt(results: FieldApplyResult[], input: ApplyInput): ApplyResult {
  return { ok: false, newData: { ...(input.currentData ?? {}) }, results };
}

function typePass(input: ApplyInput): FieldApplyResult[] {
  return input.fields.map(({ fieldPath, fieldValue }) => typeCheckOne(input.form, fieldPath, fieldValue));
}

function typeCheckOne(form: FormDefinition, fieldPath: string, fieldValue: unknown): FieldApplyResult {
  const p = parsePath(fieldPath);
  if (!p.ok) return { fieldPath, status: 'pathError', reason: p.error.reason };
  const look = zodForFieldPath(form.schemaFields, fieldPath);
  if (!look.ok) return { fieldPath, status: 'pathError', reason: 'Path does not exist on this form' };
  const v = look.zod.safeParse(fieldValue);
  if (!v.success) {
    return {
      fieldPath,
      status: 'typeError',
      reason: v.error.issues[FIRST_ISSUE]?.message ?? 'Type mismatch',
      expectedType: look.expectedType,
    };
  }
  return { fieldPath, status: 'applied', expectedType: look.expectedType };
}

function rulePass(input: ApplyInput): FieldApplyResult[] {
  return input.fields.map(({ fieldPath, fieldValue }) => ruleCheckOne(input.form, fieldPath, fieldValue));
}

function ruleCheckOne(form: FormDefinition, fieldPath: string, fieldValue: unknown): FieldApplyResult {
  const canonical = normalizePath(fieldPath);
  if (canonical === null) return { fieldPath, status: 'pathError', reason: 'Invalid path' };
  const rule = lookupRule(form.validations, canonical);
  if (rule === undefined) return { fieldPath, status: 'applied' };
  const outcome = runValidation(fieldValue, rule);
  if (outcome.ok) return { fieldPath, status: 'applied' };
  return { fieldPath, status: 'validationError', reason: outcome.reason };
}

function lookupRule(validations: ValidationsMap, key: string): ValidationRule | undefined {
  const { [key]: rule } = validations;
  return rule;
}

type MergeResult = { ok: true; data: FormData } | { ok: false; results: FieldApplyResult[] };

function mergeAll(base: FormData, fields: ApplyInputField[]): MergeResult {
  const out: FormData = structuredClone(base);
  const errors: FieldApplyResult[] = [];
  for (const { fieldPath, fieldValue } of fields) {
    const r = setAtPath(out, fieldPath, fieldValue);
    if (!r.ok) errors.push({ fieldPath, status: 'pathError', reason: r.reason });
  }
  if (errors.length === ZERO) return { ok: true, data: out };
  return { ok: false, results: errors };
}
