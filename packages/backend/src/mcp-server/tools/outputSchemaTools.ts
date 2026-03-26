import type { OutputSchemaField } from '@daviddh/graph-types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  addOutputSchema,
  deleteOutputSchema,
  getOutputSchema,
  listOutputSchemas,
  updateOutputSchema,
} from '../services/outputSchemaService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Shared schemas                                                     */
/* ------------------------------------------------------------------ */

const fieldTypeSchema = z.enum(['string', 'number', 'boolean', 'object', 'array', 'enum']);

const outputSchemaFieldSchema: z.ZodType<OutputSchemaField> = z.lazy(() =>
  z.object({
    name: z.string().describe('Field name'),
    type: fieldTypeSchema.describe('Field type'),
    required: z.boolean().describe('Whether the field is required'),
    description: z.string().optional().describe('Field description'),
    enumValues: z.array(z.string()).optional().describe('Allowed enum values'),
    items: outputSchemaFieldSchema.optional().describe('Item schema for array fields'),
    properties: z.array(outputSchemaFieldSchema).optional().describe('Properties for object fields'),
  })
);

/* ------------------------------------------------------------------ */
/*  Tool schemas                                                       */
/* ------------------------------------------------------------------ */

const LIST_OUTPUT_SCHEMAS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const GET_OUTPUT_SCHEMA_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  schemaId: z.string().describe('Output schema ID'),
};

const ADD_OUTPUT_SCHEMA_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  name: z.string().describe('Schema name'),
  fields: z.array(outputSchemaFieldSchema).describe('Schema fields'),
};

const UPDATE_OUTPUT_SCHEMA_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  schemaId: z.string().describe('Output schema ID'),
  name: z.string().optional().describe('New schema name'),
  fields: z.array(outputSchemaFieldSchema).optional().describe('New schema fields'),
};

const DELETE_OUTPUT_SCHEMA_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  schemaId: z.string().describe('Output schema ID'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListOutputSchemas(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_output_schemas',
    { description: 'List all output schemas for an agent', inputSchema: LIST_OUTPUT_SCHEMAS_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listOutputSchemas(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_output_schemas',
    description: 'List all output schemas for an agent',
    category: 'output_schema',
    inputSchema: z.toJSONSchema(z.object(LIST_OUTPUT_SCHEMAS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerGetOutputSchema(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_output_schema',
    { description: 'Get a specific output schema by ID', inputSchema: GET_OUTPUT_SCHEMA_SCHEMA },
    async ({ agentSlug, schemaId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getOutputSchema(ctx, agentId, schemaId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_output_schema',
    description: 'Get a specific output schema by ID',
    category: 'output_schema',
    inputSchema: z.toJSONSchema(z.object(GET_OUTPUT_SCHEMA_SCHEMA)) as Record<string, unknown>,
  });
}

function registerAddOutputSchema(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'add_output_schema',
    { description: 'Add a new output schema to an agent', inputSchema: ADD_OUTPUT_SCHEMA_SCHEMA },
    async ({ agentSlug, name, fields }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addOutputSchema(ctx, agentId, name, fields);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'add_output_schema',
    description: 'Add a new output schema to an agent',
    category: 'output_schema',
    inputSchema: z.toJSONSchema(z.object(ADD_OUTPUT_SCHEMA_SCHEMA)) as Record<string, unknown>,
  });
}

function registerUpdateOutputSchema(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_output_schema',
    { description: 'Update an existing output schema', inputSchema: UPDATE_OUTPUT_SCHEMA_SCHEMA },
    async ({ agentSlug, schemaId, name, fields }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateOutputSchema(ctx, agentId, schemaId, { name, fields });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_output_schema',
    description: 'Update an existing output schema',
    category: 'output_schema',
    inputSchema: z.toJSONSchema(z.object(UPDATE_OUTPUT_SCHEMA_SCHEMA)) as Record<string, unknown>,
  });
}

function registerDeleteOutputSchema(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_output_schema',
    { description: 'Delete an output schema from an agent', inputSchema: DELETE_OUTPUT_SCHEMA_SCHEMA },
    async ({ agentSlug, schemaId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await deleteOutputSchema(ctx, agentId, schemaId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'delete_output_schema',
    description: 'Delete an output schema from an agent',
    category: 'output_schema',
    inputSchema: z.toJSONSchema(z.object(DELETE_OUTPUT_SCHEMA_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerOutputSchemaTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListOutputSchemas(server, getContext, catalog);
  registerGetOutputSchema(server, getContext, catalog);
  registerAddOutputSchema(server, getContext, catalog);
  registerUpdateOutputSchema(server, getContext, catalog);
  registerDeleteOutputSchema(server, getContext, catalog);
}
