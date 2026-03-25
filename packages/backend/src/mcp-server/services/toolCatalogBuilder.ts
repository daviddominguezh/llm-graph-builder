export type ToolCategory =
  | 'agent_management'
  | 'graph_read'
  | 'graph_write'
  | 'agent_domain'
  | 'validation'
  | 'mcp_management'
  | 'mcp_library'
  | 'mcp_tool_ops'
  | 'output_schema'
  | 'context_preset'
  | 'env_variable'
  | 'api_key'
  | 'execution_key'
  | 'publishing'
  | 'simulation'
  | 'prompt_inspection'
  | 'models'
  | 'agent_intelligence'
  | 'node_intelligence'
  | 'execution_intelligence'
  | 'graph_convenience'
  | 'version_intelligence';

export interface CatalogEntry {
  name: string;
  description: string;
  category: ToolCategory;
  parameterNames: string[];
  parameterDescriptions: string[];
  inputSchema: Record<string, unknown>;
}

export interface RegisterInput {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: Record<string, unknown>;
}

interface SchemaProperty {
  description?: string;
  [key: string]: unknown;
}

type SchemaProperties = Record<string, SchemaProperty>;

function isSchemaProperties(value: unknown): value is SchemaProperties {
  return value !== null && typeof value === 'object';
}

function extractParams(inputSchema: Record<string, unknown>): {
  parameterNames: string[];
  parameterDescriptions: string[];
} {
  const { properties } = inputSchema as { properties?: unknown };
  if (!isSchemaProperties(properties)) {
    return { parameterNames: [], parameterDescriptions: [] };
  }

  const parameterNames = Object.keys(properties);
  const parameterDescriptions = parameterNames.map((key) => properties[key]?.description ?? '');

  return { parameterNames, parameterDescriptions };
}

export class ToolCatalogBuilder {
  private readonly entries: CatalogEntry[] = [];
  private frozen = false;
  private catalog: CatalogEntry[] | null = null;

  register(input: RegisterInput): void {
    if (this.frozen) return;

    const { parameterNames, parameterDescriptions } = extractParams(input.inputSchema);

    this.entries.push({
      name: input.name,
      description: input.description,
      category: input.category,
      parameterNames,
      parameterDescriptions,
      inputSchema: input.inputSchema,
    });
  }

  build(): CatalogEntry[] {
    if (this.catalog !== null) return this.catalog;

    this.frozen = true;
    this.catalog = [...this.entries];
    return this.catalog;
  }
}
