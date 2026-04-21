import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleGitHubInitiate } from './initiateRoute.js';
import { handleCreateInstallation } from './installationRoute.js';
import { handleListRepos } from './repoListRoute.js';

export function buildGitHubRouter(): express.Router {
  const router = express.Router();
  router.use(requireAuth);
  router.post('/initiate', handleGitHubInitiate);
  router.post('/installations', handleCreateInstallation);
  router.get('/installations/:installationId/repos', handleListRepos);
  return router;
}
