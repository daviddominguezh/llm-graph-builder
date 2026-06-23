import type { McpTransport } from '@/app/schemas/graph.schema';
import { describe, expect, it } from '@jest/globals';

import { analyzeTemplate } from '../templateAnalysis';

function httpTransport(url: string): McpTransport {
  return { type: 'http', url };
}

describe('analyzeTemplate', () => {
  it('extracts well-formed {{NAME}} placeholders as columns', () => {
    const result = analyzeTemplate(httpTransport('https://api.example.com/{{TENANT}}/mcp?key={{API_KEY}}'));
    expect(result.columns).toEqual(['TENANT', 'API_KEY']);
    expect(result.malformed).toEqual([]);
  });

  it('flags {{ NAME }} with surrounding spaces and yields no phantom column', () => {
    const result = analyzeTemplate(httpTransport('https://api.example.com/{{ NAME }}/mcp'));
    expect(result.columns).toEqual([]);
    expect(result.malformed).toContain('{{ NAME }}');
  });

  it('flags an inner-spaced placeholder while still extracting valid ones alongside it', () => {
    const result = analyzeTemplate(httpTransport('https://x/{{GOOD}}/{{ bad name }}'));
    expect(result.columns).toEqual(['GOOD']);
    expect(result.malformed).toEqual(['{{ bad name }}']);
  });

  it('returns empty columns and malformed for a template with no placeholders', () => {
    const result = analyzeTemplate(httpTransport('https://static.example.com/mcp'));
    expect(result.columns).toEqual([]);
    expect(result.malformed).toEqual([]);
  });

  it('extracts placeholders from stdio command/args/env', () => {
    const result = analyzeTemplate({
      type: 'stdio',
      command: '{{BIN}}',
      args: ['--token', '{{TOKEN}}'],
      env: { REGION: '{{REGION}}' },
    });
    expect(result.columns).toEqual(['BIN', 'TOKEN', 'REGION']);
    expect(result.malformed).toEqual([]);
  });

  it('deduplicates repeated placeholders in columns', () => {
    const result = analyzeTemplate(httpTransport('https://x/{{T}}/{{T}}'));
    expect(result.columns).toEqual(['T']);
  });
});
