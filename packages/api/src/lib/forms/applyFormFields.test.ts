import { expect, it } from '@jest/globals';

import type { FormData, FormDefinition } from '../../types/forms.js';
import { applyFormFields } from './applyFormFields.js';

const MIN_AGE = 18;
const VALID_AGE = 25;
const FIRST = 0;

const form: FormDefinition = {
  id: 'f1',
  agentId: 'a1',
  displayName: 'Lead',
  formSlug: 'lead',
  schemaId: 's1',
  schemaFields: [
    { name: 'name', type: 'string', required: true },
    { name: 'email', type: 'string', required: true },
    { name: 'age', type: 'number', required: false },
    {
      name: 'addresses',
      type: 'array',
      required: false,
      items: {
        name: 'it',
        type: 'object',
        required: true,
        properties: [{ name: 'firstLine', type: 'string', required: true }],
      },
    },
  ],
  validations: { email: { kind: 'email' }, age: { kind: 'length', min: MIN_AGE } },
};

it('applies valid fields', () => {
  const r = applyFormFields({
    form,
    currentData: undefined,
    fields: [
      { fieldPath: 'name', fieldValue: 'John' },
      { fieldPath: 'email', fieldValue: 'j@x.co' },
      { fieldPath: 'age', fieldValue: VALID_AGE },
    ],
  });
  expect(r.ok).toBe(true);
  expect(r.newData).toEqual({ name: 'John', email: 'j@x.co', age: VALID_AGE });
});

it('atomic on type error', () => {
  const r = applyFormFields({
    form,
    currentData: undefined,
    fields: [
      { fieldPath: 'name', fieldValue: 'John' },
      { fieldPath: 'age', fieldValue: 'nope' },
    ],
  });
  expect(r.ok).toBe(false);
  expect(r.newData).toEqual({});
});

it('atomic on validation error', () => {
  const r = applyFormFields({
    form,
    currentData: undefined,
    fields: [{ fieldPath: 'email', fieldValue: 'nope' }],
  });
  expect(r.ok).toBe(false);
  expect(r.results[FIRST]?.status).toBe('validationError');
});

it('merges with existing, preserves siblings', () => {
  const r = applyFormFields({
    form,
    currentData: { name: 'Jane' },
    fields: [{ fieldPath: 'email', fieldValue: 'j@x.co' }],
  });
  expect(r.newData).toEqual({ name: 'Jane', email: 'j@x.co' });
});

it('sets deep array path creating intermediate objects', () => {
  const r = applyFormFields({
    form,
    currentData: undefined,
    fields: [{ fieldPath: 'addresses[0].firstLine', fieldValue: '1 Main' }],
  });
  expect(r.ok).toBe(true);
  expect(r.newData).toEqual({ addresses: [{ firstLine: '1 Main' }] });
});

it('pathError when existing shape collides (array where object expected)', () => {
  const collidingData: FormData = { addresses: 'not-an-array' };
  const r = applyFormFields({
    form,
    currentData: collidingData,
    fields: [{ fieldPath: 'addresses[0].firstLine', fieldValue: 'x' }],
  });
  expect(r.ok).toBe(false);
  expect(r.results[FIRST]?.status).toBe('pathError');
});
