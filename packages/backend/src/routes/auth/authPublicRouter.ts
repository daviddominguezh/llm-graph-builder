import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleOauthDuplicateRouter } from './public/handleOauthDuplicate.js';
import { lookupEmailRouter } from './public/lookupEmail.js';

export const AUTH_PUBLIC_UNAUTHED = ['/auth/public/lookup-email'];
export const AUTH_PUBLIC_AUTHED = ['/auth/public/handle-oauth-duplicate'];

export function buildAuthPublicRouter(): express.Router {
  const router = express.Router();
  // Unauth route first
  router.use('/', lookupEmailRouter());
  // Auth required for handle-oauth-duplicate
  const authed = express.Router();
  authed.use(requireAuth);
  authed.use('/', handleOauthDuplicateRouter());
  router.use('/', authed);
  return router;
}
