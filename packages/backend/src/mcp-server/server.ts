import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { authenticateMcpKey } from './auth.js';
import { ToolCatalogBuilder } from './services/toolCatalogBuilder.js';
import { registerAllTools } from './tools/index.js';
import type { ServiceContext } from './types.js';

const SERVER_NAME = 'openflow';
const SERVER_VERSION = '1.0.0';

const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_FORBIDDEN = 403;
const JSONRPC_SERVER_ERROR = -32000;

interface JsonRpcError {
  jsonrpc: '2.0';
  error: { code: number; message: string };
  id: null;
}

function jsonRpcError(code: number, message: string): JsonRpcError {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}

function createMcpServer(getContext: () => ServiceContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );
  const catalog = new ToolCatalogBuilder();

  registerAllTools(server, getContext, catalog);
  return server;
}

async function handlePostRequest(ctx: ServiceContext, req: Request, res: Response): Promise<void> {
  const getContext = (): ServiceContext => ctx;
  const server = createMcpServer(getContext);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);

  res.on('close', () => {
    void transport.close();
    void server.close();
  });
}

function sendMethodNotAllowed(res: Response): void {
  res
    .writeHead(HTTP_METHOD_NOT_ALLOWED)
    .end(JSON.stringify(jsonRpcError(JSONRPC_SERVER_ERROR, 'Method not allowed.')));
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  if (req.method === 'GET' || req.method === 'DELETE') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const ctx = await authenticateMcpKey(req.headers.authorization);
    await handlePostRequest(ctx, req, res);
  } catch (err) {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      res.status(HTTP_FORBIDDEN).json(jsonRpcError(JSONRPC_SERVER_ERROR, message));
    }
  }
}
