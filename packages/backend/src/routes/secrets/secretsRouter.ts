import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateApiKey } from './createApiKey.js';
import { handleCreateEnvVar } from './createEnvVar.js';
import { handleCreateExecutionKey } from './createExecutionKey.js';
import { handleDeleteApiKey } from './deleteApiKey.js';
import { handleDeleteEnvVar } from './deleteEnvVar.js';
import { handleDeleteExecutionKey } from './deleteExecutionKey.js';
import { handleGetApiKeyValue } from './getApiKeyValue.js';
import { handleGetApiKeys } from './getApiKeys.js';
import { handleGetEnvVarValue } from './getEnvVarValue.js';
import { handleGetEnvVars } from './getEnvVars.js';
import { handleGetExecutionKeyAgents } from './getExecutionKeyAgents.js';
import { handleGetExecutionKeys } from './getExecutionKeys.js';
import { handleUpdateEnvVar } from './updateEnvVar.js';
import { handleUpdateExecutionKey } from './updateExecutionKey.js';

export const secretsRouter = express.Router();
secretsRouter.use(requireAuth);

secretsRouter.get('/api-keys/:orgId', handleGetApiKeys);
secretsRouter.get('/api-keys/:keyId/value', handleGetApiKeyValue);
secretsRouter.post('/api-keys', handleCreateApiKey);
secretsRouter.delete('/api-keys/:keyId', handleDeleteApiKey);

secretsRouter.get('/env-vars/:orgId', handleGetEnvVars);
secretsRouter.get('/env-vars/:varId/value', handleGetEnvVarValue);
secretsRouter.post('/env-vars', handleCreateEnvVar);
secretsRouter.patch('/env-vars/:varId', handleUpdateEnvVar);
secretsRouter.delete('/env-vars/:varId', handleDeleteEnvVar);

secretsRouter.get('/execution-keys/:orgId', handleGetExecutionKeys);
secretsRouter.get('/execution-keys/:keyId/agents', handleGetExecutionKeyAgents);
secretsRouter.post('/execution-keys', handleCreateExecutionKey);
secretsRouter.patch('/execution-keys/:keyId', handleUpdateExecutionKey);
secretsRouter.delete('/execution-keys/:keyId', handleDeleteExecutionKey);
