import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveAgentId, textResult } from '../helpers.js';
import {
  addContextPreset,
  deleteContextPreset,
  listContextPresets,
  updateContextPreset,
} from '../services/contextPresetService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Shared schemas                                                     */
/* ------------------------------------------------------------------ */

const presetFieldsSchema = {
  agentSlug: z.string().describe('Agent slug'),
  name: z.string().describe('Preset name (unique identifier)'),
  sessionId: z.string().optional().describe('Session ID for this preset'),
  tenantId: z.string().optional().describe('Tenant ID for this preset'),
  userId: z.string().optional().describe('User ID for this preset'),
  data: z.record(z.string(), z.unknown()).optional().describe('Arbitrary preset data'),
};

const LIST_CONTEXT_PRESETS_SCHEMA = { agentSlug: z.string().describe('Agent slug') };

const DELETE_CONTEXT_PRESET_SCHEMA = {
  agentSlug: z.string().describe('Agent slug'),
  name: z.string().describe('Preset name to delete'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListContextPresets(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_context_presets',
    { description: 'List all context presets for an agent', inputSchema: LIST_CONTEXT_PRESETS_SCHEMA },
    async ({ agentSlug }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      const result = await listContextPresets(ctx, agentId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_context_presets',
    description: 'List all context presets for an agent',
    category: 'context_preset',
    inputSchema: z.toJSONSchema(z.object(LIST_CONTEXT_PRESETS_SCHEMA)) as Record<string, unknown>,
  });
}

function registerAddContextPreset(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'add_context_preset',
    { description: 'Add a new context preset for an agent', inputSchema: presetFieldsSchema },
    async ({ agentSlug, name, sessionId, tenantId, userId, data }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await addContextPreset(ctx, agentId, { name, sessionId, tenantId, userId, data });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'add_context_preset',
    description: 'Add a new context preset for an agent',
    category: 'context_preset',
    inputSchema: z.toJSONSchema(z.object(presetFieldsSchema)) as Record<string, unknown>,
  });
}

function registerUpdateContextPreset(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_context_preset',
    { description: 'Update an existing context preset', inputSchema: presetFieldsSchema },
    async ({ agentSlug, name, sessionId, tenantId, userId, data }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await updateContextPreset(ctx, agentId, { name, sessionId, tenantId, userId, data });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_context_preset',
    description: 'Update an existing context preset',
    category: 'context_preset',
    inputSchema: z.toJSONSchema(z.object(presetFieldsSchema)) as Record<string, unknown>,
  });
}

function registerDeleteContextPreset(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_context_preset',
    { description: 'Delete a context preset from an agent', inputSchema: DELETE_CONTEXT_PRESET_SCHEMA },
    async ({ agentSlug, name }) => {
      const ctx = getContext();
      const agentId = await resolveAgentId(ctx, agentSlug);
      await deleteContextPreset(ctx, agentId, name);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_context_preset',
    description: 'Delete a context preset from an agent',
    category: 'context_preset',
    inputSchema: z.toJSONSchema(z.object(DELETE_CONTEXT_PRESET_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Register all                                                       */
/* ------------------------------------------------------------------ */

export function registerContextPresetTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListContextPresets(server, getContext, catalog);
  registerAddContextPreset(server, getContext, catalog);
  registerUpdateContextPreset(server, getContext, catalog);
  registerDeleteContextPreset(server, getContext, catalog);
}
