import { describe, expect, it } from '@jest/globals';

import {
  MCP_VARIABLE_PATTERN,
  buildResolvedVars,
  extractTemplateVariables,
  resolveTransport,
} from './mcpTransportResolver.js';
import type { McpServerConfig, McpTransport, VariableValue } from './types/index.js';

/* ── legacy regexes (the two verified variants) ──
 * LEGACY_PLAIN is the historical *unnamed* capture-group form: derived from the
 * canonical pattern's source by stripping the `?<name>` group label, so the
 * assertion pins that positional group 1 still matches the pre-migration form.
 * LEGACY_NAMED is the named `/gv` form. Both must agree with MCP_VARIABLE_PATTERN. */
const PLAIN_SOURCE = MCP_VARIABLE_PATTERN.source.replace('?<name>', '');
const LEGACY_PLAIN = new RegExp(PLAIN_SOURCE, MCP_VARIABLE_PATTERN.flags);
const LEGACY_NAMED = /\{\{(?<name>\w+)\}\}/gv;

function matchGroup1(re: RegExp, s: string): string[] {
  return [...s.matchAll(re)].map(([, group1]) => group1 ?? '');
}

/* ── legacy #3/#4 transport substitution (NO env/headers) ── */
function legacyNarrowReplace(str: string, vars: Record<string, string>): string {
  return str.replace(LEGACY_NAMED, (_, name: string) => vars[name] ?? `{{${name}}}`);
}
function legacyNarrowTransport(t: McpTransport, vars: Record<string, string>): McpTransport {
  if (t.type === 'stdio') {
    return {
      ...t,
      command: legacyNarrowReplace(t.command, vars),
      args: t.args?.map((a) => legacyNarrowReplace(a, vars)),
    };
  }
  return { ...t, url: legacyNarrowReplace(t.url, vars) };
}

describe('regex parity (R-a)', () => {
  const corpus = ['{{A}}', '{{a_b1}}', '{{ }}', '{{a}}{{b}}', '{{{{x}}}}', 'no vars', '{{café}}'];
  it.each(corpus)('plain /g group1 === named /gv group1 for %p', (s) => {
    expect(matchGroup1(MCP_VARIABLE_PATTERN, s)).toEqual(matchGroup1(LEGACY_PLAIN, s));
    expect(matchGroup1(MCP_VARIABLE_PATTERN, s)).toEqual(matchGroup1(LEGACY_NAMED, s));
  });
});

describe('resolveTransport — full superset (R-c / D5)', () => {
  it('stdio: substitutes command, args AND env', () => {
    const t: McpTransport = {
      type: 'stdio',
      command: '{{CMD}}',
      args: ['{{A}}', 'x'],
      env: { K: '{{TOK}}' },
    };
    expect(resolveTransport(t, { CMD: 'npx', A: 'flag', TOK: 'secret' })).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['flag', 'x'],
      env: { K: 'secret' },
    });
  });
  it('http: substitutes url AND headers', () => {
    const t: McpTransport = {
      type: 'http',
      url: 'https://{{HOST}}',
      headers: { Authorization: 'Bearer {{TOK}}' },
    };
    expect(resolveTransport(t, { HOST: 'api.x', TOK: 'secret' })).toEqual({
      type: 'http',
      url: 'https://api.x',
      headers: { Authorization: 'Bearer secret' },
    });
  });
  it('sse: substitutes url AND headers', () => {
    const t: McpTransport = { type: 'sse', url: '{{U}}', headers: { X: '{{V}}' } };
    expect(resolveTransport(t, { U: 'u', V: 'v' })).toEqual({ type: 'sse', url: 'u', headers: { X: 'v' } });
  });
  it('leaves unmatched {{x}} literal', () => {
    const t: McpTransport = { type: 'http', url: '{{KNOWN}}/{{MISSING}}' };
    expect(resolveTransport(t, { KNOWN: 'a' })).toEqual({ type: 'http', url: 'a/{{MISSING}}' });
  });
  it('undefined args/env/headers pass through as undefined', () => {
    const t: McpTransport = { type: 'stdio', command: 'c' };
    expect(resolveTransport(t, {})).toEqual({ type: 'stdio', command: 'c', args: undefined, env: undefined });
  });
});

describe('resolveTransport — INTENDED divergence from legacy #3/#4 (the leak fix)', () => {
  it('http headers: new substitutes where legacy narrow leaked literal', () => {
    const t: McpTransport = { type: 'http', url: 'u', headers: { Authorization: 'Bearer {{TOK}}' } };
    const vars = { TOK: 'secret' };
    expect(legacyNarrowTransport(t, vars)).toEqual({
      type: 'http',
      url: 'u',
      headers: { Authorization: 'Bearer {{TOK}}' },
    });
    expect(resolveTransport(t, vars)).toEqual({
      type: 'http',
      url: 'u',
      headers: { Authorization: 'Bearer secret' },
    });
  });
  it('stdio env: new substitutes where legacy narrow leaked literal', () => {
    const t: McpTransport = { type: 'stdio', command: 'c', env: { K: '{{TOK}}' } };
    const vars = { TOK: 'secret' };
    expect(legacyNarrowTransport(t, vars)).toEqual({
      type: 'stdio',
      command: 'c',
      args: undefined,
      env: { K: '{{TOK}}' },
    });
    expect(resolveTransport(t, vars)).toEqual({
      type: 'stdio',
      command: 'c',
      args: undefined,
      env: { K: 'secret' },
    });
  });
  it('stdio command/args still match legacy exactly', () => {
    const t: McpTransport = { type: 'stdio', command: '{{C}}', args: ['{{A}}'] };
    const vars = { C: 'npx', A: 'flag' };
    const narrow = legacyNarrowTransport(t, vars);
    const unified = resolveTransport(t, vars);
    expect(unified.type === 'stdio' && unified.command).toBe(narrow.type === 'stdio' && narrow.command);
  });
});

describe('extractTemplateVariables', () => {
  it('dedups and preserves first-seen order across all fields (incl. env/headers)', () => {
    const t: McpTransport = { type: 'http', url: '{{B}}/{{A}}', headers: { H: '{{A}}', G: '{{C}}' } };
    expect(extractTemplateVariables(t)).toEqual(['B', 'A', 'C']);
  });
  it('reads stdio env vars', () => {
    const t: McpTransport = { type: 'stdio', command: '{{X}}', env: { K: '{{Y}}' } };
    expect(extractTemplateVariables(t)).toEqual(['X', 'Y']);
  });
});

describe('buildResolvedVars — preserves the direct/env_ref/fallback mapping exactly', () => {
  const env = { byName: { N1: 'n1' }, byId: { id1: 'v1' } };
  it('direct → value', () => {
    const vv: Record<string, VariableValue> = { T: { type: 'direct', value: 'd' } };
    expect(buildResolvedVars(vv, env)).toEqual({ T: 'd' });
  });
  it('env_ref hit → byId[id]', () => {
    const vv: Record<string, VariableValue> = { T: { type: 'env_ref', envVariableId: 'id1' } };
    expect(buildResolvedVars(vv, env)).toEqual({ T: 'v1' });
  });
  it('env_ref miss → empty string', () => {
    const vv: Record<string, VariableValue> = { T: { type: 'env_ref', envVariableId: 'nope' } };
    expect(buildResolvedVars(vv, env)).toEqual({ T: '' });
  });
  it('undefined variableValues → byName fallback (execute superset)', () => {
    expect(buildResolvedVars(undefined, env)).toEqual({ N1: 'n1' });
  });
});

describe('McpServerConfig type is exercised', () => {
  it('accepts a config whose transport resolveTransport can process', () => {
    const sample: McpServerConfig = {
      id: 's1',
      name: 'svc',
      transport: { type: 'http', url: 'https://{{HOST}}' },
      enabled: true,
    };
    expect(resolveTransport(sample.transport, { HOST: 'api.x' })).toEqual({
      type: 'http',
      url: 'https://api.x',
    });
  });
});
