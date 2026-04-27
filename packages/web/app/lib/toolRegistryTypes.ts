export interface RegistryTool {
  name: string;
  description: string | undefined;
  inputSchema: Record<string, unknown> | undefined;
  group: string;
  sourceId: string;
}

export interface ToolGroup {
  groupName: string;
  tools: RegistryTool[];
}
