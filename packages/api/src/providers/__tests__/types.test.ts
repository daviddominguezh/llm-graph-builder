import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { type OpenFlowTool, toAiSdkTool } from '../types.js';

describe('toAiSdkTool', () => {
  it('maps an OpenFlowTool to an AI SDK Tool', () => {
    const inputSchema = z.object({ name: z.string() });
    const ofTool: OpenFlowTool<typeof inputSchema, string> = {
      description: 'Greet the user',
      inputSchema,
      execute: (args: { name: string }) => `hello ${args.name}`,
    };
    const aiTool = toAiSdkTool(ofTool);
    expect(aiTool.description).toBe('Greet the user');
    expect(aiTool.inputSchema).toBeDefined();
    expect(typeof aiTool.execute).toBe('function');
  });
});
