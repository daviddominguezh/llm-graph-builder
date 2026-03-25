import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type express from 'express';
import type { Server } from 'node:http';

const RANDOM_PORT = 0;

export function startTestServer(app: express.Express): Server {
  return app.listen(RANDOM_PORT);
}

export async function connectClient(port: number): Promise<Client> {
  const url = new URL(`http://localhost:${String(port)}/mcp`);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  return client;
}
