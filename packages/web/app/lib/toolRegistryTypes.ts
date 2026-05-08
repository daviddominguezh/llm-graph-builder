export interface RegistryTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
  group: string;
  sourceId: string;
}

export interface ToolGroup {
  kind: 'builtin' | 'mcp';
  groupName: string;
  tools: RegistryTool[];
  fetchedAt?: number;
}
