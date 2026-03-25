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
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListOutputSchemas(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_output_schemas',
    {
      description: 'List all output schemas for an agent',
      inputSchema: { agentSlug: z.string().describe('Agent slug') },
    },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listOutputSchemas(ctx, agentId);
      return textResult(result);
    }
  );
}

function registerGetOutputSchema(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_output_schema',
    {
      description: 'Get a specific output schema by ID',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        schemaId: z.string().describe('Output schema ID'),
      },
    },
    async ({ agentSlug, schemaId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await getOutputSchema(ctx, agentId, schemaId);
      return textResult(result);
    }
  );
}

function registerAddOutputSchema(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'add_output_schema',
    {
      description: 'Add a new output schema to an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        name: z.string().describe('Schema name'),
        fields: z.array(outputSchemaFieldSchema).describe('Schema fields'),
      },
    },
    async ({ agentSlug, name, fields }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await addOutputSchema(ctx, agentId, name, fields);
      return textResult(result);
    }
  );
}

function registerUpdateOutputSchema(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_output_schema',
    {
      description: 'Update an existing output schema',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        schemaId: z.string().describe('Output schema ID'),
        name: z.string().optional().describe('New schema name'),
        fields: z.array(outputSchemaFieldSchema).optional().describe('New schema fields'),
      },
    },
    async ({ agentSlug, schemaId, name, fields }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateOutputSchema(ctx, agentId, schemaId, { name, fields });
      return textResult({ success: true });
    }
  );
}

function registerDeleteOutputSchema(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_output_schema',
    {
      description: 'Delete an output schema from an agent',
      inputSchema: {
        agentSlug: z.string().describe('Agent slug'),
        schemaId: z.string().describe('Output schema ID'),
      },
    },
    async ({ agentSlug, schemaId }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await deleteOutputSchema(ctx, agentId, schemaId);
      return textResult(result);
    }
  );
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerOutputSchemaTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListOutputSchemas(server, getContext);
  registerGetOutputSchema(server, getContext);
  registerAddOutputSchema(server, getContext);
  registerUpdateOutputSchema(server, getContext);
  registerDeleteOutputSchema(server, getContext);
}
