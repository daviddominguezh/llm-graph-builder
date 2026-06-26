import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import {
  type OpenFlowTool,
  type RawJsonSchema,
  namespaceToolName,
  parseNamespacedToolName,
  toAiSdkTool,
} from '../types.js';

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

describe('namespaceToolName / parseNamespacedToolName', () => {
  it('round-trips a simple (providerId, toolName) pair', () => {
    const name = namespaceToolName('kv_store', 'search');
    expect(name).toBe('kv_store__search');
    expect(parseNamespacedToolName(name)).toEqual({ providerId: 'kv_store', toolName: 'search' });
  });

  it('splits on the first separator so tool names containing __ survive', () => {
    const name = namespaceToolName('rag', 'fancy__search');
    expect(parseNamespacedToolName(name)).toEqual({ providerId: 'rag', toolName: 'fancy__search' });
  });

  it('returns null for malformed input (defensive contract)', () => {
    expect(parseNamespacedToolName('no_separator_here')).toBeNull();
    expect(parseNamespacedToolName('__missing_provider')).toBeNull();
    expect(parseNamespacedToolName('missing_tool__')).toBeNull();
    expect(parseNamespacedToolName('')).toBeNull();
  });
});
