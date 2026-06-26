import type { ApplyResult, FailedAttempt, FormData, FormDefinition } from '../types/forms.js';

export interface FormsService {
  getFormDefinitions: (agentId: string) => Promise<FormDefinition[]>;
  getFormData: (conversationId: string, formId: string) => Promise<FormData | undefined>;
  applyFormFieldsAtomic: (args: {
    conversationId: string;
    form: FormDefinition;
    fields: Array<{ fieldPath: string; fieldValue: unknown }>;
  }) => Promise<ApplyResult>;
  recordFailedAttempt: (conversationId: string, formId: string, attempt: FailedAttempt) => Promise<void>;
}
