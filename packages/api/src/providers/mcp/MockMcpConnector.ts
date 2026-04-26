import type { McpServerConfig } from '@daviddh/graph-types';
import type { Tool as AiSdkTool } from 'ai';

import type { McpClient, McpConnector } from './types.js';

export interface MockMcpClientArgs {
  toolsByServer: Map<string, Record<string, AiSdkTool>>;
  /** When true, connect() rejects — useful for testing failure paths. */
  failConnect?: boolean;
  /** When true, tools() rejects — useful for testing partial failure paths. */
  failTools?: boolean;
}

export class MockMcpConnector implements McpConnector {
  readonly connectCalls: McpServerConfig[] = [];
  readonly closedClients: number[] = [];

  constructor(private readonly args: MockMcpClientArgs) {}

  async connect(server: McpServerConfig): Promise<McpClient> {
    this.connectCalls.push(server);
    if (this.args.failConnect === true) {
      throw new Error(`mock connect failure: ${server.id}`);
    }
    return await Promise.resolve(this.makeClient(server, this.connectCalls.length));
  }

  private makeClient(server: McpServerConfig, callId: number): McpClient {
    const { closedClients } = this;
    const { args } = this;
    const toolsForServer = args.toolsByServer.get(server.id) ?? {};
    return {
      tools: async () => {
        if (args.failTools === true) throw new Error(`mock tools failure: ${server.id}`);
        return await Promise.resolve(toolsForServer);
      },
      close: async () => {
        closedClients.push(callId);
        await Promise.resolve();
      },
    };
  }
}
