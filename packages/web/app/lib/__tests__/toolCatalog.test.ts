/**
 * Enforces the FE tool-catalog convention.
 *
 * For every builtin provider in `@daviddh/llm-graph-runner`, this test walks
 * the descriptors returned by `describeTools(ctx)` and asserts that
 * `packages/web/messages/en.json` has a matching entry under
 * `toolCatalog.<providerId>` for:
 *   - the group name,
 *   - every tool's description,
 *   - every tool parameter (top-level inputSchema.properties).
 *
 * If a key is missing, the test fails with a precise list of what to add.
 * This is what makes the design pattern obvious to the next developer who
 * adds a builtin tool — CI fails loudly until the translation is in place.
 */
import { type Provider, type ProviderCtx, builtInProviders } from '@daviddh/llm-graph-runner';
import { describe, expect, it } from '@jest/globals';

import enMessages from '../../../messages/en.json';

interface DescriptorLike {
  toolName: string;
  inputSchema: {
    properties?: Record<string, unknown>;
  };
}

interface MessagesShape {
  toolCatalog: Record<string, unknown>;
}

type LoggerMethod = ProviderCtx['logger']['info'];

const LOGGER_METHODS = [
  'error',
  'warn',
  'help',
  'data',
  'info',
  'debug',
  'prompt',
  'http',
  'verbose',
  'input',
  'silly',
] as const;

function noopLogger(): ProviderCtx['logger'] {
  const noop: LoggerMethod = () => undefined;
  const entries = LOGGER_METHODS.map((name) => [name, noop] as const);
  return Object.fromEntries(entries) as unknown as ProviderCtx['logger'];
}

function fakeCtx(): ProviderCtx {
  return {
    orgId: 'test-org',
    tenantId: 'test-tenant',
    agentId: 'test-agent',
    isChildAgent: false,
    logger: noopLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

function get(obj: unknown, path: readonly string[]): unknown {
  let current: unknown = obj;
  for (const segment of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function paramNames(schema: DescriptorLike['inputSchema']): string[] {
  const props = schema.properties;
  if (props === undefined || props === null) return [];
  return Object.keys(props);
}

async function descriptorsFor(provider: Provider): Promise<DescriptorLike[]> {
  const result = await provider.describeTools(fakeCtx());
  const list = Array.isArray(result) ? result : result.tools;
  return list.map((d) => ({
    toolName: d.toolName,
    inputSchema: d.inputSchema as DescriptorLike['inputSchema'],
  }));
}

function collectMissingForTool(providerId: string, descriptor: DescriptorLike, catalog: unknown): string[] {
  const missing: string[] = [];
  const descriptionPath = [providerId, 'tools', descriptor.toolName, 'description'];
  if (!isNonEmptyString(get(catalog, descriptionPath))) {
    missing.push(`toolCatalog.${descriptionPath.join('.')}`);
  }
  for (const paramName of paramNames(descriptor.inputSchema)) {
    const paramPath = [providerId, 'tools', descriptor.toolName, 'params', paramName];
    if (!isNonEmptyString(get(catalog, paramPath))) {
      missing.push(`toolCatalog.${paramPath.join('.')}`);
    }
  }
  return missing;
}

async function collectMissingForProvider(
  providerId: string,
  provider: Provider,
  catalog: unknown
): Promise<string[]> {
  const missing: string[] = [];
  const groupNamePath = [providerId, 'groupName'];
  if (!isNonEmptyString(get(catalog, groupNamePath))) {
    missing.push(`toolCatalog.${groupNamePath.join('.')}`);
  }
  const descriptors = await descriptorsFor(provider);
  for (const descriptor of descriptors) {
    missing.push(...collectMissingForTool(providerId, descriptor, catalog));
  }
  return missing;
}

describe('toolCatalog (en.json) covers every builtin provider', () => {
  const messages = enMessages as unknown as MessagesShape;
  const catalog = messages.toolCatalog;

  it('declares the _about field documenting the convention', () => {
    expect(isNonEmptyString((catalog as Record<string, unknown>)._about)).toBe(true);
  });

  for (const [providerId, provider] of builtInProviders) {
    if (provider.type !== 'builtin') continue;
    it(`has translations for every tool + param of "${providerId}"`, async () => {
      const missing = await collectMissingForProvider(providerId, provider, catalog);
      if (missing.length > 0) {
        const list = missing.map((m) => `  - ${m}`).join('\n');
        throw new Error(
          `Missing tool-catalog translation keys for provider "${providerId}":\n${list}\n` +
            `Add the keys to packages/web/messages/en.json. See toolCatalog._about for the convention.`
        );
      }
      expect(missing).toEqual([]);
    });
  }
});
