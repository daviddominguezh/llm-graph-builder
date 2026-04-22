import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { completeOnboardingRouter } from './completeOnboarding.js';
import { identitiesRouter } from './identities.js';
import { phoneCheckRouter } from './phoneCheck.js';
import { phoneSendOtpRouter } from './phoneSendOtp.js';
import { phoneVerifyOtpRouter } from './phoneVerifyOtp.js';
import { statusRouter } from './status.js';
import { unlinkGoogleRouter } from './unlinkGoogle.js';

export function buildAuthRouter(): express.Router {
  const router = express.Router();
  router.use(requireAuth);

  router.use('/phone', phoneCheckRouter());
  router.use('/phone', phoneSendOtpRouter());
  router.use('/phone', phoneVerifyOtpRouter());

  router.use('/', completeOnboardingRouter());
  router.use('/', statusRouter());
  router.use('/', identitiesRouter());
  router.use('/', unlinkGoogleRouter());

  return router;
}
