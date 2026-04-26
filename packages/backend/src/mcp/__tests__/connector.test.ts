import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';

// Mock connectMcpClient before importing the connector
const mockClient = {
  tools: jest.fn(async () => await Promise.resolve({})),
  close: jest.fn(async () => {
    await Promise.resolve();
  }),
};

interface TransportArg {
  type: string;
  url?: string;
}

jest.unstable_mockModule('../client.js', () => ({
  connectMcpClient: jest.fn(async (transport: TransportArg) => {
    if (transport.url === 'https://invalid.example/mcp') {
      throw new Error('connection refused: invalid server');
    }
    return await Promise.resolve(mockClient);
  }),
}));

const { createBackendMcpConnector } = await import('../connector.js');
const { testConnectorConformance } = await import('@daviddh/llm-graph-runner');

const validServer: McpServerConfig = {
  id: 'mcp-1',
  name: 'fake-mcp',
  transport: { type: 'http', url: 'https://fake.example/mcp' },
  enabled: true,
};

const invalidServer: McpServerConfig = {
  id: 'mcp-invalid',
  name: 'invalid',
  transport: { type: 'http', url: 'https://invalid.example/mcp' },
  enabled: true,
};

describe('createBackendMcpConnector', () => {
  testConnectorConformance('backend', () => createBackendMcpConnector(), {
    validServer,
    invalidServer,
  });

  it('adapts the ai-sdk client to the McpClient interface', async () => {
    const connector = createBackendMcpConnector();
    const client = await connector.connect(validServer);
    expect(typeof client.tools).toBe('function');
    expect(typeof client.close).toBe('function');
    await client.close();
  });

  it('close is idempotent — multiple calls succeed', async () => {
    const connector = createBackendMcpConnector();
    const client = await connector.connect(validServer);
    await client.close();
    await expect(client.close()).resolves.not.toThrow();
  });
});
