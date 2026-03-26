import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { textResult } from '../helpers.js';
import {
  createEnvVariable,
  deleteEnvVariable,
  getEnvVariableValue,
  listEnvVariables,
  updateEnvVariable,
} from '../services/envVariableService.js';
import type { ToolCatalogBuilder } from '../services/toolCatalogBuilder.js';
import type { ServiceContext } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Schemas                                                            */
/* ------------------------------------------------------------------ */

const LIST_ENV_VARIABLES_SCHEMA = {};

const CREATE_ENV_VARIABLE_SCHEMA = {
  name: z.string().describe('Variable name'),
  value: z.string().describe('Variable value'),
  isSecret: z.boolean().optional().describe('Whether the variable is secret'),
};

const UPDATE_ENV_VARIABLE_SCHEMA = {
  variableId: z.string().describe('Environment variable ID'),
  name: z.string().optional().describe('New name'),
  value: z.string().optional().describe('New value'),
  isSecret: z.boolean().optional().describe('Whether the variable is secret'),
};

const DELETE_ENV_VARIABLE_SCHEMA = {
  variableId: z.string().describe('Environment variable ID'),
};

const GET_ENV_VARIABLE_VALUE_SCHEMA = {
  variableId: z.string().describe('Environment variable ID'),
};

/* ------------------------------------------------------------------ */
/*  Tool registrations                                                 */
/* ------------------------------------------------------------------ */

function registerListEnvVariables(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'list_env_variables',
    {
      description: 'List all environment variables in the organization',
      inputSchema: LIST_ENV_VARIABLES_SCHEMA,
    },
    async () => {
      const ctx = getContext();
      const result = await listEnvVariables(ctx);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'list_env_variables',
    description: 'List all environment variables in the organization',
    category: 'env_variable',
    inputSchema: z.toJSONSchema(z.object(LIST_ENV_VARIABLES_SCHEMA)) as Record<string, unknown>,
  });
}

function registerCreateEnvVariable(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'create_env_variable',
    {
      description: 'Create a new environment variable in the organization',
      inputSchema: CREATE_ENV_VARIABLE_SCHEMA,
    },
    async ({ name, value, isSecret }) => {
      const ctx = getContext();
      const result = await createEnvVariable(ctx, name, value, isSecret);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'create_env_variable',
    description: 'Create a new environment variable in the organization',
    category: 'env_variable',
    inputSchema: z.toJSONSchema(z.object(CREATE_ENV_VARIABLE_SCHEMA)) as Record<string, unknown>,
  });
}

function registerUpdateEnvVariable(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'update_env_variable',
    { description: 'Update an environment variable', inputSchema: UPDATE_ENV_VARIABLE_SCHEMA },
    async ({ variableId, name, value, isSecret }) => {
      const ctx = getContext();
      await updateEnvVariable(ctx, variableId, { name, value, isSecret });
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'update_env_variable',
    description: 'Update an environment variable',
    category: 'env_variable',
    inputSchema: z.toJSONSchema(z.object(UPDATE_ENV_VARIABLE_SCHEMA)) as Record<string, unknown>,
  });
}

function registerDeleteEnvVariable(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'delete_env_variable',
    { description: 'Delete an environment variable', inputSchema: DELETE_ENV_VARIABLE_SCHEMA },
    async ({ variableId }) => {
      const ctx = getContext();
      await deleteEnvVariable(ctx, variableId);
      return textResult({ success: true });
    }
  );
  catalog.register({
    name: 'delete_env_variable',
    description: 'Delete an environment variable',
    category: 'env_variable',
    inputSchema: z.toJSONSchema(z.object(DELETE_ENV_VARIABLE_SCHEMA)) as Record<string, unknown>,
  });
}

function registerGetEnvVariableValue(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  server.registerTool(
    'get_env_variable_value',
    { description: 'Get the value of an environment variable', inputSchema: GET_ENV_VARIABLE_VALUE_SCHEMA },
    async ({ variableId }) => {
      const ctx = getContext();
      const result = await getEnvVariableValue(ctx, variableId);
      return textResult(result);
    }
  );
  catalog.register({
    name: 'get_env_variable_value',
    description: 'Get the value of an environment variable',
    category: 'env_variable',
    inputSchema: z.toJSONSchema(z.object(GET_ENV_VARIABLE_VALUE_SCHEMA)) as Record<string, unknown>,
  });
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerEnvVariableTools(
  server: McpServer,
  getContext: () => ServiceContext,
  catalog: ToolCatalogBuilder
): void {
  registerListEnvVariables(server, getContext, catalog);
  registerCreateEnvVariable(server, getContext, catalog);
  registerUpdateEnvVariable(server, getContext, catalog);
  registerDeleteEnvVariable(server, getContext, catalog);
  registerGetEnvVariableValue(server, getContext, catalog);
}
