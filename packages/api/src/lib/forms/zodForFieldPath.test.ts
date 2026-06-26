import { describe, expect, it } from '@jest/globals';

import { zodForFieldPath } from './zodForFieldPath.js';

const schema = [
  { name: 'name', type: 'string' as const, required: true },
  { name: 'age', type: 'number' as const, required: false },
  { name: 'status', type: 'enum' as const, required: false, enumValues: ['a', 'b'] },
  {
    name: 'addresses',
    type: 'array' as const,
    required: false,
    items: {
      name: 'item',
      type: 'object' as const,
      required: true,
      properties: [{ name: 'firstLine', type: 'string' as const, required: true }],
    },
  },
];

describe('zodForFieldPath', () => {
  it('string', () => {
    const r = zodForFieldPath(schema, 'name');
    expect(r.ok && r.zod.safeParse('x').success).toBe(true);
  });

  it('number rejects string', () => {
    const r = zodForFieldPath(schema, 'age');
    expect(r.ok && r.zod.safeParse('3').success).toBe(false);
  });

  it('enum rejects non-member', () => {
    const r = zodForFieldPath(schema, 'status');
    expect(r.ok && r.zod.safeParse('c').success).toBe(false);
  });

  it('nested array path resolves', () => {
    expect(zodForFieldPath(schema, 'addresses[0].firstLine').ok).toBe(true);
  });

  it('unknown path fails', () => {
    expect(zodForFieldPath(schema, 'unknown').ok).toBe(false);
  });
});
