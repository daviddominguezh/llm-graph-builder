import { describe, expect, it } from '@jest/globals';

import type { CatalogEntry } from '../services/toolCatalogBuilder.js';
import { getToolSchemas, searchTools } from '../services/toolSearchService.js';

const FIRST = 0;
const SECOND = 1;
const MAX_SEARCH_RESULTS = 5;
const TWO_RESULTS = 2;
const ONE_RESULT = 1;

const fixture: CatalogEntry[] = [
  {
    name: 'list_agents',
    description: 'List all agents in the organization',
    category: 'agent_management',
    parameterNames: ['search'],
    parameterDescriptions: ['Filter by name or slug substring'],
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
  },
  {
    name: 'create_agent',
    description: 'Create a new agent in the organization',
    category: 'agent_management',
    parameterNames: ['name', 'description'],
    parameterDescriptions: ['Agent name', 'Agent description'],
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, description: { type: 'string' } },
    },
  },
  {
    name: 'add_node',
    description: 'Create a new node in an agents graph',
    category: 'graph_write',
    parameterNames: ['agentSlug', 'id', 'text', 'kind'],
    parameterDescriptions: ['Agent slug', 'Node ID', 'Node text', 'Node kind'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'validate_graph',
    description: 'Run all violation-detection rules on the graph',
    category: 'validation',
    parameterNames: ['agentSlug'],
    parameterDescriptions: ['Agent slug'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_mcp_servers',
    description: 'List MCP servers configured on an agents graph',
    category: 'mcp_management',
    parameterNames: ['agentSlug'],
    parameterDescriptions: ['Agent slug'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'publish_agent',
    description: 'Publish the current draft as a new version',
    category: 'publishing',
    parameterNames: ['agentSlug'],
    parameterDescriptions: ['Agent slug'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'simulate_agent',
    description: 'Run the agent with messages and get a full debug trace',
    category: 'simulation',
    parameterNames: ['agentSlug', 'messages'],
    parameterDescriptions: ['Agent slug', 'Conversation messages'],
    inputSchema: { type: 'object', properties: {} },
  },
];

function testExactNameMatchScoresHighest(): void {
  const results = searchTools(fixture, 'list_agents');
  expect(results[FIRST]?.name).toBe('list_agents');
}

function testNameContainsWithUnderscores(): void {
  const results = searchTools(fixture, 'add node');
  expect(results[FIRST]?.name).toBe('add_node');
}

function testCategoryMatch(): void {
  const results = searchTools(fixture, 'validation');
  expect(results[FIRST]?.name).toBe('validate_graph');
}

function testDescriptionMatch(): void {
  const results = searchTools(fixture, 'violation');
  expect(results[FIRST]?.name).toBe('validate_graph');
}

function testParameterNameMatch(): void {
  const results = searchTools(fixture, 'messages');
  expect(results[FIRST]?.name).toBe('simulate_agent');
}

function testMultiTermCombinesScores(): void {
  const results = searchTools(fixture, 'create agent');
  expect(results[FIRST]?.name).toBe('create_agent');
}

function testReturnsMaxFiveResults(): void {
  const results = searchTools(fixture, 'agent');
  expect(results.length).toBeLessThanOrEqual(MAX_SEARCH_RESULTS);
}

function testEmptyQueryReturnsEmpty(): void {
  const results = searchTools(fixture, '');
  expect(results).toEqual([]);
}

function testWhitespaceQueryReturnsEmpty(): void {
  const results = searchTools(fixture, '   ');
  expect(results).toEqual([]);
}

function testNoMatchReturnsEmpty(): void {
  const results = searchTools(fixture, 'xyznonexistent');
  expect(results).toEqual([]);
}

function testResultsShapeExcludesInputSchema(): void {
  const results = searchTools(fixture, 'list_agents');
  expect(results[FIRST]).toEqual({
    name: 'list_agents',
    description: 'List all agents in the organization',
    category: 'agent_management',
  });
  expect(results[FIRST]).not.toHaveProperty('inputSchema');
}

function testReturnsSchemaForValidNames(): void {
  const results = getToolSchemas(fixture, ['list_agents', 'add_node']);
  expect(results).toHaveLength(TWO_RESULTS);
  expect(results[FIRST]?.name).toBe('list_agents');
  expect(results[FIRST]?.inputSchema).toBeDefined();
  expect(results[SECOND]?.name).toBe('add_node');
}

function testSilentlySkipsUnknownNames(): void {
  const results = getToolSchemas(fixture, ['list_agents', 'nonexistent']);
  expect(results).toHaveLength(ONE_RESULT);
  expect(results[FIRST]?.name).toBe('list_agents');
}

function testEmptyInputReturnsEmpty(): void {
  const results = getToolSchemas(fixture, []);
  expect(results).toEqual([]);
}

function testResultIncludesAllFields(): void {
  const results = getToolSchemas(fixture, ['list_agents']);
  expect(results[FIRST]).toHaveProperty('name');
  expect(results[FIRST]).toHaveProperty('description');
  expect(results[FIRST]).toHaveProperty('category');
  expect(results[FIRST]).toHaveProperty('inputSchema');
}

describe('searchTools', () => {
  it('exact name match scores highest', testExactNameMatchScoresHighest);
  it('name-contains match works with underscores as spaces', testNameContainsWithUnderscores);
  it('category match works', testCategoryMatch);
  it('description match works', testDescriptionMatch);
  it('parameter name match works', testParameterNameMatch);
  it('multi-term query combines scores', testMultiTermCombinesScores);
  it('returns max 5 results', testReturnsMaxFiveResults);
  it('empty query returns empty array', testEmptyQueryReturnsEmpty);
  it('whitespace-only query returns empty array', testWhitespaceQueryReturnsEmpty);
  it('no-match query returns empty array', testNoMatchReturnsEmpty);
  it('results contain name, description, category only', testResultsShapeExcludesInputSchema);
});

describe('getToolSchemas', () => {
  it('returns schemas for valid names', testReturnsSchemaForValidNames);
  it('silently skips unknown names', testSilentlySkipsUnknownNames);
  it('returns empty array for empty input', testEmptyInputReturnsEmpty);
  it('result includes name, description, category, and inputSchema', testResultIncludesAllFields);
});
