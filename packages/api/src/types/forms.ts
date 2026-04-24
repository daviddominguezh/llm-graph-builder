// packages/api/src/types/forms.ts
import type { OutputSchemaField } from '@daviddh/graph-types';

export type ValidationKind =
  | 'email' | 'twoWordName' | 'pastDate' | 'futureDate'
  | 'pastHour' | 'futureHour' | 'length';

export interface LengthPayload { min?: number; max?: number; exact?: number }

export type ValidationRule =
  | { kind: Exclude<ValidationKind, 'length'> }
  | ({ kind: 'length' } & LengthPayload);

export type ValidationsMap = Record<string, ValidationRule>;

export interface FormDefinition {
  id: string;
  agentId: string;
  displayName: string;
  formSlug: string;
  schemaId: string;
  schemaFields: OutputSchemaField[];
  validations: ValidationsMap;
}

export type FormData = Record<string, unknown>;

export interface PathSegment {
  fieldName: string;
  indices: Array<number | 'wildcard'>;
}

export interface FieldApplyResult {
  fieldPath: string;
  status: 'applied' | 'typeError' | 'pathError' | 'validationError';
  reason?: string;
  expectedType?: string;
}

export interface ApplyResult {
  ok: boolean;
  newData: FormData;
  results: FieldApplyResult[];
}

export interface FailedAttempt {
  at: string;
  errors: FieldApplyResult[];
}
