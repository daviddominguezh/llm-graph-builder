import { describe, expect, it } from '@jest/globals';

import type { ToolFieldValue } from '@src/types/graph.js';

import { buildResolvedFieldsPrompt, resolveReferenceValue } from './referenceResolver.js';

describe('resolveReferenceValue', () => {
  const outputs: Record<string, unknown[]> = {
    nodeA: [{ teamId: 'abc-123', note: null }],
    nodeB: [{ teamId: 'def-456' }, { teamId: 'ghi-789' }],
  };

  it('resolves single value', () => {
    const result = resolveReferenceValue({ type: 'reference', nodeId: 'nodeA', path: 'teamId' }, outputs);
    expect(result).toEqual({ kind: 'single', value: 'abc-123' });
  });

  it('resolves multiple values from cycles', () => {
    const result = resolveReferenceValue({ type: 'reference', nodeId: 'nodeB', path: 'teamId' }, outputs);
    expect(result).toEqual({ kind: 'multiple', values: ['def-456', 'ghi-789'] });
  });

  it('falls back when node not visited', () => {
    const result = resolveReferenceValue(
      {
        type: 'reference',
        nodeId: 'nodeC',
        path: 'teamId',
        fallbacks: [{ type: 'fixed', value: 'fallback-val' }],
      },
      outputs
    );
    expect(result).toEqual({ kind: 'single', value: 'fallback-val' });
  });

  it('falls back when value is null', () => {
    const result = resolveReferenceValue(
      {
        type: 'reference',
        nodeId: 'nodeA',
        path: 'note',
        fallbacks: [{ type: 'fixed', value: 'default-note' }],
      },
      outputs
    );
    expect(result).toEqual({ kind: 'single', value: 'default-note' });
  });
});

describe('buildResolvedFieldsPrompt', () => {
  it('builds prompt for fixed fields', () => {
    const fields: Record<string, ToolFieldValue> = {
      team_id: { type: 'fixed', value: 'fixed-val' },
    };
    const prompt = buildResolvedFieldsPrompt(fields, {});
    expect(prompt).toContain('team_id: "fixed-val"');
    expect(prompt).toContain('EXACT values');
  });

  it('builds prompt for single and multi reference values', () => {
    const outputs: Record<string, unknown[]> = {
      nodeA: [{ teamId: 'abc' }],
      nodeB: [{ ts: '1' }, { ts: '2' }],
    };
    const fields: Record<string, ToolFieldValue> = {
      team_id: { type: 'reference', nodeId: 'nodeA', path: 'teamId' },
      timestamp: { type: 'reference', nodeId: 'nodeB', path: 'ts' },
    };
    const prompt = buildResolvedFieldsPrompt(fields, outputs);
    expect(prompt).toContain('team_id: "abc"');
    expect(prompt).toContain('timestamp: one of');
  });

  it('builds prompt mixing fixed and reference fields', () => {
    const outputs: Record<string, unknown[]> = { nodeA: [{ teamId: 'abc' }] };
    const fields: Record<string, ToolFieldValue> = {
      team_id: { type: 'reference', nodeId: 'nodeA', path: 'teamId' },
      region: { type: 'fixed', value: 'us-east-1' },
    };
    const prompt = buildResolvedFieldsPrompt(fields, outputs);
    expect(prompt).toContain('team_id: "abc"');
    expect(prompt).toContain('region: "us-east-1"');
  });
});
