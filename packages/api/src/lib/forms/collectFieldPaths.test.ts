import { expect, it } from '@jest/globals';

import { collectFieldPaths, collectSimpleLeafPaths } from './collectFieldPaths.js';

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
      properties: [
        { name: 'firstLine', type: 'string' as const, required: true },
        { name: 'zip', type: 'number' as const, required: false },
      ],
    },
  },
  {
    name: 'phones',
    type: 'array' as const,
    required: false,
    items: { name: 'p', type: 'string' as const, required: true },
  },
];

it('collects all leaf paths', () => {
  expect(collectFieldPaths(schema)).toEqual([
    'name',
    'age',
    'status',
    'addresses[].firstLine',
    'addresses[].zip',
    'phones[]',
  ]);
});

it('collects only string/number leaves with types', () => {
  expect(collectSimpleLeafPaths(schema)).toEqual([
    { path: 'name', type: 'string' },
    { path: 'age', type: 'number' },
    { path: 'addresses[].firstLine', type: 'string' },
    { path: 'addresses[].zip', type: 'number' },
    { path: 'phones[]', type: 'string' },
  ]);
});
