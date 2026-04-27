import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleGetGraph } from '../graph/getGraph.js';
import { handleGetVersion } from '../graph/getVersion.js';
import { handleGetVersions } from '../graph/getVersions.js';
import { handlePostOperations } from '../graph/postOperations.js';
import { handlePostPublish } from '../graph/postPublish.js';
import { handlePostRestore } from '../graph/postRestore.js';
import { handleGoogleDisconnect } from '../oauth/googleOauthDisconnect.js';
import { handleGoogleInitiate } from '../oauth/googleOauthInitiate.js';
import { handleGoogleStatus } from '../oauth/googleOauthStatus.js';
import { handleDisconnect } from '../oauth/oauthDisconnect.js';
import { handleInitiate } from '../oauth/oauthInitiate.js';
import { handleResolveToken } from '../oauth/oauthResolveToken.js';
import { handleStatus } from '../oauth/oauthStatus.js';
import { handleCreateAgent } from './createAgent.js';
import { handleDeleteAgent } from './deleteAgentHandler.js';
import { handleGetAgentBySlug } from './getAgentBySlug.js';
import { handleGetAgentsByOrg } from './getAgentsByOrg.js';
import { handleGetAgentRegistry } from './getRegistry.js';
import { handleGetVfsSettings } from './getVfsSettings.js';
import { handleSaveProductionKey } from './saveProductionKey.js';
import { handleSaveStagingKey } from './saveStagingKey.js';
import { selectedToolsLimiter } from './selectedToolsRateLimiter.js';
import { handleUpdateCategory } from './updateCategory.js';
import { handleUpdateMetadata } from './updateMetadata.js';
import { handleUpdateSelectedTools } from './updateSelectedTools.js';
import { handleUpdateVfsSettings } from './updateVfsSettings.js';
import { handleUpdateVisibility } from './updateVisibility.js';
import { vfsConfigRouter } from './vfsConfigRouter.js';

export const agentRouter = express.Router();
agentRouter.use(requireAuth);

agentRouter.get('/by-org/:orgId', handleGetAgentsByOrg);
agentRouter.get('/by-slug/:slug', handleGetAgentBySlug);
agentRouter.post('/', handleCreateAgent);
agentRouter.delete('/:agentId', handleDeleteAgent);
agentRouter.patch('/:agentId/staging-key', handleSaveStagingKey);
agentRouter.patch('/:agentId/production-key', handleSaveProductionKey);
agentRouter.patch('/:agentId/visibility', handleUpdateVisibility);
agentRouter.patch('/:agentId/category', handleUpdateCategory);
agentRouter.patch('/:agentId/metadata', handleUpdateMetadata);
agentRouter.patch('/:agentId/selected-tools', selectedToolsLimiter, handleUpdateSelectedTools);

agentRouter.get('/:agentId/registry', handleGetAgentRegistry);
agentRouter.get('/:agentId/graph', handleGetGraph);
agentRouter.post('/:agentId/graph/operations', handlePostOperations);
agentRouter.post('/:agentId/publish', handlePostPublish);
agentRouter.get('/:agentId/versions', handleGetVersions);
agentRouter.get('/:agentId/versions/:version', handleGetVersion);
agentRouter.post('/:agentId/versions/:version/restore', handlePostRestore);

agentRouter.post('/mcp-oauth/initiate', handleInitiate);
agentRouter.get('/mcp-oauth/status', handleStatus);
agentRouter.post('/mcp-oauth/resolve-token', handleResolveToken);
agentRouter.delete('/mcp-oauth/connections', handleDisconnect);

agentRouter.post('/google-oauth/initiate', handleGoogleInitiate);
agentRouter.get('/google-oauth/status', handleGoogleStatus);
agentRouter.delete('/google-oauth/connections', handleGoogleDisconnect);

agentRouter.use('/:agentId/vfs-configs', vfsConfigRouter);
agentRouter.get('/:agentId/vfs-settings', handleGetVfsSettings);
agentRouter.patch('/:agentId/vfs-settings', handleUpdateVfsSettings);
