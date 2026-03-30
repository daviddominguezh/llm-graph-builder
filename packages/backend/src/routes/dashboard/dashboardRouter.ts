import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleDeleteSession } from './deleteSession.js';
import { handleGetAgentSummary } from './getAgentSummary.js';
import { handleGetDashboardTimeSeries } from './getDashboardTimeSeries.js';
import { handleGetExecutionsByTenant } from './getExecutionsByTenant.js';
import { handleGetExecutionsForSession } from './getExecutionsForSession.js';
import { handleGetExecutionMessages } from './getExecutionMessages.js';
import { handleGetNodeVisits } from './getNodeVisits.js';
import { handleGetSessionDetail } from './getSessionDetail.js';
import { handleGetSessionsByAgent } from './getSessionsByAgent.js';
import { handleGetTenantSummary } from './getTenantSummary.js';

export const dashboardRouter = express.Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/:orgId/agent-summary', handleGetAgentSummary);
dashboardRouter.get('/:orgId/tenant-summary', handleGetTenantSummary);
dashboardRouter.get('/:orgId/timeseries', handleGetDashboardTimeSeries);
dashboardRouter.get('/:orgId/tenants/:tenantId/executions', handleGetExecutionsByTenant);
dashboardRouter.get('/:orgId/sessions/:agentId', handleGetSessionsByAgent);
dashboardRouter.get('/sessions/:sessionId', handleGetSessionDetail);
dashboardRouter.get('/sessions/:sessionId/executions', handleGetExecutionsForSession);
dashboardRouter.get('/executions/:executionId/node-visits', handleGetNodeVisits);
dashboardRouter.get('/executions/:executionId/messages', handleGetExecutionMessages);
dashboardRouter.delete('/sessions/:sessionId', handleDeleteSession);
