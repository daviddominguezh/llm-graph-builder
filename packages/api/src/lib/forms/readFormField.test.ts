import { describe, expect, it } from '@jest/globals';

import { readFormField } from './readFormField.js';

describe('readFormField', () => {
  const data = { name: 'John', addresses: [{ firstLine: '123 Main St' }, { firstLine: '7 Oak' }] };
  it('reads top-level field', () => {
    expect(readFormField(data, 'name')).toEqual({ ok: true, value: 'John' });
  });
  it('reads indexed nested field', () => {
    expect(readFormField(data, 'addresses[1].firstLine')).toEqual({ ok: true, value: '7 Oak' });
  });
  it('returns not-set for missing field', () => {
    expect(readFormField(data, 'age')).toMatchObject({ ok: false });
  });
  it('returns parse error for bad path', () => {
    expect(readFormField(data, 'a[-1]')).toMatchObject({ ok: false });
  });
});
