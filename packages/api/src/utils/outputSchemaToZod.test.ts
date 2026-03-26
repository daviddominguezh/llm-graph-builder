import type { OutputSchemaField } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import { outputSchemaToZod } from './outputSchemaToZod.js';

describe('outputSchemaToZod - primitive types', () => {
  it('converts string fields', () => {
    const fields: OutputSchemaField[] = [{ name: 'teamId', type: 'string', required: true }];
    const schema = outputSchemaToZod(fields);
    const result = schema.safeParse({ teamId: 'abc' });
    expect(result.success).toBe(true);
  });

  it('rejects missing required field', () => {
    const fields: OutputSchemaField[] = [{ name: 'teamId', type: 'string', required: true }];
    const schema = outputSchemaToZod(fields);
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('allows null for optional fields', () => {
    const fields: OutputSchemaField[] = [{ name: 'note', type: 'string', required: false }];
    const schema = outputSchemaToZod(fields);
    const result = schema.safeParse({ note: null });
    expect(result.success).toBe(true);
  });

  it('converts enum fields', () => {
    const fields: OutputSchemaField[] = [
      { name: 'status', type: 'enum', required: true, enumValues: ['active', 'inactive'] },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ status: 'active' }).success).toBe(true);
    expect(schema.safeParse({ status: 'unknown' }).success).toBe(false);
  });

  it('converts number and boolean fields', () => {
    const fields: OutputSchemaField[] = [
      { name: 'count', type: 'number', required: true },
      { name: 'active', type: 'boolean', required: true },
    ];
    const schema = outputSchemaToZod(fields);
    const count = 5;
    expect(schema.safeParse({ count, active: true }).success).toBe(true);
  });
});

describe('outputSchemaToZod - composite types', () => {
  it('converts nested object fields', () => {
    const fields: OutputSchemaField[] = [
      {
        name: 'address',
        type: 'object',
        required: true,
        properties: [
          { name: 'city', type: 'string', required: true },
          { name: 'zip', type: 'string', required: false },
        ],
      },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ address: { city: 'NYC', zip: null } }).success).toBe(true);
  });

  it('converts array fields', () => {
    const fields: OutputSchemaField[] = [
      {
        name: 'tags',
        type: 'array',
        required: true,
        items: { name: 'tag', type: 'string', required: true },
      },
    ];
    const schema = outputSchemaToZod(fields);
    expect(schema.safeParse({ tags: ['a', 'b'] }).success).toBe(true);
  });
});
