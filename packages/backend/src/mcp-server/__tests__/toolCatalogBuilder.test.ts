import { beforeEach, describe, expect, it } from '@jest/globals';

import { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';

const SINGLE_ENTRY = 1;
const FIRST = 0;

let builder: ToolCatalogBuilder = new ToolCatalogBuilder();

beforeEach(() => {
  builder = new ToolCatalogBuilder();
});

function registerListAgents(): void {
  builder.register({
    name: 'list_agents',
    description: 'List all agents',
    category: 'agent_management',
    inputSchema: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Filter query' } },
    },
  });
}

function registerAddNode(): void {
  builder.register({
    name: 'add_node',
    description: 'Add a node',
    category: 'graph_write',
    inputSchema: {
      type: 'object',
      properties: {
        agentSlug: { type: 'string', description: 'Agent slug' },
        id: { type: 'string', description: 'Node ID' },
        text: { type: 'string', description: 'Node text' },
      },
    },
  });
}

function testRegistersEntry(): void {
  registerListAgents();
  const catalog = builder.build();
  expect(catalog).toHaveLength(SINGLE_ENTRY);
  expect(catalog[FIRST]?.name).toBe('list_agents');
  expect(catalog[FIRST]?.category).toBe('agent_management');
  expect(catalog[FIRST]?.parameterNames).toEqual(['search']);
  expect(catalog[FIRST]?.parameterDescriptions).toEqual(['Filter query']);
}

function testBuildIdempotent(): void {
  builder.register({
    name: 'test_tool',
    description: 'Test',
    category: 'agent_management',
    inputSchema: { type: 'object', properties: {} },
  });
  const first = builder.build();
  const second = builder.build();
  expect(first).toBe(second);
}

function testExtractsParams(): void {
  registerAddNode();
  const catalog = builder.build();
  expect(catalog[FIRST]?.parameterNames).toEqual(['agentSlug', 'id', 'text']);
  expect(catalog[FIRST]?.parameterDescriptions).toEqual(['Agent slug', 'Node ID', 'Node text']);
}

function testHandlesEmptyProperties(): void {
  builder.register({
    name: 'no_params',
    description: 'No params',
    category: 'models',
    inputSchema: { type: 'object' },
  });
  const catalog = builder.build();
  expect(catalog[FIRST]?.parameterNames).toEqual([]);
  expect(catalog[FIRST]?.parameterDescriptions).toEqual([]);
}

function testSilentlySkipsAfterBuild(): void {
  builder.build();
  builder.register({
    name: 'late_tool',
    description: 'Too late',
    category: 'models',
    inputSchema: { type: 'object' },
  });
  const catalog = builder.build();
  expect(catalog.every((e) => e.name !== 'late_tool')).toBe(true);
}

describe('ToolCatalogBuilder', () => {
  it('registers an entry and builds the catalog', testRegistersEntry);
  it('build is idempotent — returns same array on repeated calls', testBuildIdempotent);
  it('extracts parameter names and descriptions from JSON Schema properties', testExtractsParams);
  it('handles empty properties gracefully', testHandlesEmptyProperties);
  it('silently skips registration after build', testSilentlySkipsAfterBuild);
});
