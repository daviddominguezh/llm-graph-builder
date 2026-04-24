import { describe, expect, it, jest } from '@jest/globals';

import type { FormsService } from '../services/formsService.js';
import type { ApplyResult, FormData, FormDefinition } from '../types/forms.js';
import { buildFormsToolDescription, createFormsTools, SET_FORM_FIELDS_TOOL_NAME } from './formsTools.js';
import { executeSet } from './formsToolsExecute.js';

const form: FormDefinition = {
  id: 'f1',
  agentId: 'a1',
  displayName: 'Lead',
  formSlug: 'lead',
  schemaId: 's1',
  schemaFields: [
    { name: 'name', type: 'string', required: true },
    { name: 'email', type: 'string', required: true },
  ],
  validations: { email: { kind: 'email' } },
};

const successResult: ApplyResult = {
  ok: true,
  newData: { name: 'x' },
  results: [{ fieldPath: 'name', status: 'applied' }],
};

const failureResult: ApplyResult = {
  ok: false,
  newData: {},
  results: [{ fieldPath: 'email', status: 'validationError', reason: 'bad' }],
};

const ZERO = 0;
const ONE = 1;

const makeServices = (apply?: ApplyResult): FormsService => ({
  getFormDefinitions: async () => await Promise.resolve([form]),
  getFormData: async () => await Promise.resolve<FormData | undefined>(undefined),
  applyFormFieldsAtomic: jest.fn(
    async () => await Promise.resolve(apply ?? successResult)
  ) as FormsService['applyFormFieldsAtomic'],
  recordFailedAttempt: jest.fn(async () => {
    await Promise.resolve();
  }) as FormsService['recordFailedAttempt'],
});

describe('buildFormsToolDescription', () => {
  it('lists forms and validations', () => {
    const d = buildFormsToolDescription([form]);
    expect(d).toContain('lead');
    expect(d).toContain('valid email');
  });

  it('handles empty forms gracefully', () => {
    const d = buildFormsToolDescription([]);
    expect(typeof d).toBe('string');
    expect(d.length).toBeGreaterThan(ZERO);
  });
});

describe('createFormsTools', () => {
  it('exposes the set_form_fields tool', () => {
    const tools = createFormsTools({ forms: [form], services: makeServices(), conversationId: 'c1' });
    expect(tools[SET_FORM_FIELDS_TOOL_NAME]).toBeDefined();
  });
});

describe('executeSet', () => {
  it('not-found returns ok:false with available list', async () => {
    const services = makeServices();
    const res = await executeSet(
      { formSlug: 'nope', fields: [{ fieldPath: 'x', fieldValue: ONE }] },
      { forms: [form], services, conversationId: 'c1' }
    );
    expect(res).toMatchObject({ result: { ok: false } });
  });

  it('success calls service and returns applied list', async () => {
    const services = makeServices();
    const res = await executeSet(
      { formSlug: 'lead', fields: [{ fieldPath: 'name', fieldValue: 'x' }] },
      { forms: [form], services, conversationId: 'c1' }
    );
    expect(services.applyFormFieldsAtomic).toHaveBeenCalled();
    expect(res).toMatchObject({ result: { ok: true } });
  });

  it('on failure records the attempt', async () => {
    const services = makeServices(failureResult);
    await executeSet(
      { formSlug: 'lead', fields: [{ fieldPath: 'email', fieldValue: 'nope' }] },
      { forms: [form], services, conversationId: 'c1' }
    );
    expect(services.recordFailedAttempt).toHaveBeenCalled();
  });
});
