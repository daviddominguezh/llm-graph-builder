import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { once } from 'node:events';
import type { Server } from 'node:http';

import { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import { registerAllTools } from '../tools/index.js';
import { registerToolSearchTools } from '../tools/toolSearchTools.js';
import type { ServiceContext } from '../types.js';
import { printSummary, runAllAssertions } from './test-tool-search-assertions.js';
import { connectClient, startTestServer } from './test-tool-search-helpers.js';

const EXIT_FAILURE = 1;
const NONE = 0;

function createTestMcpServer(): McpServer {
  const server = new McpServer({ name: 'openflow-test', version: '1.0.0' }, { capabilities: { tools: {} } });
  const builder = new ToolCatalogBuilder();
  const getContext = (): ServiceContext => {
    throw new Error('Not available in test');
  };
  registerAllTools(server, getContext, builder);
  const catalog = builder.build();
  registerToolSearchTools(server, catalog);
  return server;
}

async function handleMcpPost(req: express.Request, res: express.Response): Promise<void> {
  const server = createTestMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
}

function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.post('/mcp', (req, res) => {
    void handleMcpPost(req, res);
  });
  return app;
}

function getServerPort(httpServer: Server): number {
  const addr = httpServer.address();
  if (addr !== null && typeof addr === 'object') {
    return addr.port;
  }
  throw new Error('Failed to get server address');
}

async function closeServer(httpServer: Server): Promise<void> {
  httpServer.close();
  await once(httpServer, 'close');
}

async function main(): Promise<void> {
  const app = createApp();
  const httpServer = startTestServer(app);
  const port = getServerPort(httpServer);

  process.stdout.write(`\nMCP test server on port ${String(port)}\n\n`);

  const client = await connectClient(port);
  const failed = await runAllAssertions(client);
  printSummary(failed);

  await client.close();
  await closeServer(httpServer);

  process.exit(failed > NONE ? EXIT_FAILURE : NONE);
}

void main();
