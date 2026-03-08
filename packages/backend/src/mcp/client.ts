import { createMCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import type { McpTransport } from '@daviddh/graph-types';

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

interface StdioTransport {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface SseTransport {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

function createStdioTransport(transport: StdioTransport): Experimental_StdioMCPTransport {
  return new Experimental_StdioMCPTransport({
    command: transport.command,
    args: transport.args,
    env: transport.env,
  });
}

function createSseConfig(transport: SseTransport): {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
} {
  return {
    type: 'sse' as const,
    url: transport.url,
    headers: transport.headers,
  };
}

export async function connectMcpClient(transport: McpTransport): Promise<McpClient> {
  if (transport.type === 'stdio') {
    return await createMCPClient({ transport: createStdioTransport(transport) });
  }

  return await createMCPClient({ transport: createSseConfig(transport) });
}
