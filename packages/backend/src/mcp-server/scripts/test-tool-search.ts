import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { CatalogEntry } from '../services/toolCatalogBuilder.js';
import { getToolSchemas, searchTools } from '../services/toolSearchService.js';
import type { SchemaResult } from '../services/toolSearchService.js';
import { registerAllTools } from '../tools/index.js';
import type { ServiceContext } from '../types.js';

const EXPECTED_TOOL_COUNT = 84;
const EXPECTED_SCHEMA_COUNT = 2;
const FIRST = 0;
const NONE = 0;
const ONE = 1;
const EXIT_FAILURE = 1;

function unreachableCtx(): ServiceContext {
  throw new Error('Context must not be accessed during catalog building');
}

function buildCatalog(): CatalogEntry[] {
  const server = new McpServer({ name: 'openflow-test', version: '1.0.0' }, { capabilities: { tools: {} } });
  const builder = new ToolCatalogBuilder();
  registerAllTools(server, unreachableCtx, builder);
  return builder.build();
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

const catalog = buildCatalog();
process.stdout.write(`\nCatalog: ${String(catalog.length)} tools\n\n`);

assert(catalog.length === EXPECTED_TOOL_COUNT, 'catalog has 84 tools');

const tests = [
  { query: 'create agent', expect: 'create_agent' },
  { query: 'validate', expect: 'validate_graph' },
  { query: 'mcp server', expect: 'list_mcp_servers' },
  { query: 'publish', expect: 'publish_agent' },
  { query: 'simulate', expect: 'simulate_agent' },
  { query: 'environment variable', expect: 'list_env_variables' },
  { query: 'execution key', expect: 'list_execution_keys' },
];

process.stdout.write('--- Search ---\n');
for (const t of tests) {
  const results = searchTools(catalog, t.query);
  const names = results.map((r) => r.name);
  assert(names.includes(t.expect), `"${t.query}" → ${t.expect} (got: ${names.join(', ')})`);
}

process.stdout.write('\n--- Schema ---\n');
const schemas: SchemaResult[] = getToolSchemas(catalog, ['add_node', 'validate_graph']);
assert(schemas.length === EXPECTED_SCHEMA_COUNT, 'getToolSchemas returns 2');
assert(schemas[FIRST]?.inputSchema !== undefined, 'has inputSchema');

const empty: SchemaResult[] = getToolSchemas(catalog, ['nonexistent']);
assert(empty.length === NONE, 'skips unknown');

process.stdout.write(`\n${String(passed)} passed, ${String(failed)} failed\n`);
process.exit(failed > NONE ? EXIT_FAILURE : NONE);
