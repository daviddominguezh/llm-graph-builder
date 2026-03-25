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
import type { ServiceContext } from '../types.js';

function registerListEnvVariables(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'list_env_variables',
    {
      description: 'List all environment variables in the organization',
      inputSchema: {},
    },
    async () => {
      const ctx = getContext();
      const result = await listEnvVariables(ctx);
      return textResult(result);
    }
  );
}

function registerCreateEnvVariable(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'create_env_variable',
    {
      description: 'Create a new environment variable in the organization',
      inputSchema: {
        name: z.string().describe('Variable name'),
        value: z.string().describe('Variable value'),
        isSecret: z.boolean().optional().describe('Whether the variable is secret'),
      },
    },
    async ({ name, value, isSecret }) => {
      const ctx = getContext();
      const result = await createEnvVariable(ctx, name, value, isSecret);
      return textResult(result);
    }
  );
}

function registerUpdateEnvVariable(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'update_env_variable',
    {
      description: 'Update an environment variable',
      inputSchema: {
        variableId: z.string().describe('Environment variable ID'),
        name: z.string().optional().describe('New name'),
        value: z.string().optional().describe('New value'),
        isSecret: z.boolean().optional().describe('Whether the variable is secret'),
      },
    },
    async ({ variableId, name, value, isSecret }) => {
      const ctx = getContext();
      await updateEnvVariable(ctx, variableId, { name, value, isSecret });
      return textResult({ success: true });
    }
  );
}

function registerDeleteEnvVariable(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'delete_env_variable',
    {
      description: 'Delete an environment variable',
      inputSchema: {
        variableId: z.string().describe('Environment variable ID'),
      },
    },
    async ({ variableId }) => {
      const ctx = getContext();
      await deleteEnvVariable(ctx, variableId);
      return textResult({ success: true });
    }
  );
}

function registerGetEnvVariableValue(server: McpServer, getContext: () => ServiceContext): void {
  server.registerTool(
    'get_env_variable_value',
    {
      description: 'Get the value of an environment variable',
      inputSchema: {
        variableId: z.string().describe('Environment variable ID'),
      },
    },
    async ({ variableId }) => {
      const ctx = getContext();
      const result = await getEnvVariableValue(ctx, variableId);
      return textResult(result);
    }
  );
}

export function registerEnvVariableTools(server: McpServer, getContext: () => ServiceContext): void {
  registerListEnvVariables(server, getContext);
  registerCreateEnvVariable(server, getContext);
  registerUpdateEnvVariable(server, getContext);
  registerDeleteEnvVariable(server, getContext);
  registerGetEnvVariableValue(server, getContext);
}
