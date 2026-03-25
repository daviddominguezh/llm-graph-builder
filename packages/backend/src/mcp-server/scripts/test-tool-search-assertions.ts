import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

const EXPECTED_TOOL_COUNT = 86;
const MAX_SEARCH_RESULTS = 5;
const NONE = 0;
const ONE = 1;
const FIRST = 0;

interface SearchResultEntry {
  name: string;
  description: string;
  category: string;
}

interface SchemaResultEntry {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
}

function isSearchResults(value: unknown): value is SearchResultEntry[] {
  return Array.isArray(value);
}

function isSchemaResults(value: unknown): value is SchemaResultEntry[] {
  return Array.isArray(value);
}

let passed = NONE;
let failed = NONE;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += ONE;
    process.stdout.write(`  PASS: ${message}\n`);
  } else {
    failed += ONE;
    process.stderr.write(`  FAIL: ${message}\n`);
  }
}

function hasContent(
  result: ToolResult
): result is ToolResult & { content: Array<{ type: string; text?: string }> } {
  return 'content' in result && Array.isArray(result.content);
}

function extractText(result: ToolResult): string {
  if (!hasContent(result)) return '[]';
  const { content } = result;
  const [first] = content;
  if (first?.type === 'text' && typeof first.text === 'string') {
    return first.text;
  }
  return '[]';
}

function parseSearchResults(result: ToolResult): SearchResultEntry[] {
  const parsed: unknown = JSON.parse(extractText(result));
  if (!isSearchResults(parsed)) return [];
  return parsed;
}

function parseSchemaResults(result: ToolResult): SchemaResultEntry[] {
  const parsed: unknown = JSON.parse(extractText(result));
  if (!isSchemaResults(parsed)) return [];
  return parsed;
}

async function assertToolCount(client: Client): Promise<void> {
  const { tools } = await client.listTools();
  process.stdout.write(`Tools available: ${String(tools.length)}\n\n`);
  assert(tools.length === EXPECTED_TOOL_COUNT, `listTools returns ${String(EXPECTED_TOOL_COUNT)} tools`);
}

async function assertSearchFindsExpected(client: Client, query: string, expectedName: string): Promise<void> {
  const result = await client.callTool({ name: 'search_tools', arguments: { query } });
  const names = parseSearchResults(result).map((r) => r.name);
  assert(names.includes(expectedName), `search "${query}" contains ${expectedName}`);
}

async function assertSearchCap(client: Client): Promise<void> {
  const result = await client.callTool({
    name: 'search_tools',
    arguments: { query: 'agent' },
  });
  const items = parseSearchResults(result);
  assert(items.length <= MAX_SEARCH_RESULTS, `search results max ${String(MAX_SEARCH_RESULTS)}`);
}

async function assertGetToolSchema(client: Client): Promise<void> {
  const result = await client.callTool({
    name: 'get_tool_schema',
    arguments: { toolNames: ['create_agent'] },
  });
  const schemas = parseSchemaResults(result);
  assert(schemas.length === ONE, 'get_tool_schema returns 1 result');
  assert(schemas[FIRST]?.inputSchema !== undefined, 'result has inputSchema');
}

async function assertGetToolSchemaEmpty(client: Client): Promise<void> {
  const result = await client.callTool({
    name: 'get_tool_schema',
    arguments: { toolNames: ['nonexistent'] },
  });
  const schemas = parseSchemaResults(result);
  assert(schemas.length === NONE, 'get_tool_schema skips unknown tools');
}

export async function runAllAssertions(client: Client): Promise<number> {
  process.stdout.write('--- Tool List ---\n');
  await assertToolCount(client);

  process.stdout.write('\n--- Search ---\n');
  await assertSearchFindsExpected(client, 'create agent', 'create_agent');
  await assertSearchFindsExpected(client, 'validate', 'validate_graph');
  await assertSearchCap(client);

  process.stdout.write('\n--- Schema ---\n');
  await assertGetToolSchema(client);
  await assertGetToolSchemaEmpty(client);

  return failed;
}

export function printSummary(failCount: number): void {
  process.stdout.write(`\n${String(passed)} passed, ${String(failCount)} failed\n`);
}
