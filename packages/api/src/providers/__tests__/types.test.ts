import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { type OpenFlowTool, type RawJsonSchema, toAiSdkTool } from '../types.js';

describe('toAiSdkTool', () => {
  it('maps a Zod-schema OpenFlowTool to an AI SDK Tool', () => {
    const inputSchema = z.object({ name: z.string() });
    const ofTool: OpenFlowTool<string> = {
      description: 'Greet the user',
      inputSchema,
      execute: (args: unknown) => {
        const parsed = inputSchema.parse(args);
        return `hello ${parsed.name}`;
      },
    };
    const aiTool = toAiSdkTool(ofTool);
    expect(aiTool.description).toBe('Greet the user');
    expect(aiTool.inputSchema).toBeDefined();
    expect(typeof aiTool.execute).toBe('function');
  });

  it('maps a RawJsonSchema OpenFlowTool to an AI SDK Tool', () => {
    const inputSchema: RawJsonSchema = {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    };
    const ofTool: OpenFlowTool<string> = {
      description: 'Greet via JSON Schema',
      inputSchema,
      execute: (args: unknown) => `hello ${String(args)}`,
    };
    const aiTool = toAiSdkTool(ofTool);
    expect(aiTool.description).toBe('Greet via JSON Schema');
    expect(aiTool.inputSchema).toBeDefined();
    expect(typeof aiTool.execute).toBe('function');
  });
});
