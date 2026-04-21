import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import {
  requireGateComplete,
  requireOnboardingIncomplete,
  requirePhoneUnverified,
} from '../../middleware/gates.js';
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

  // Phone endpoints: require phone NOT yet verified
  const phoneGate = express.Router();
  phoneGate.use(requirePhoneUnverified);
  phoneGate.use('/', phoneCheckRouter());
  phoneGate.use('/', phoneSendOtpRouter());
  phoneGate.use('/', phoneVerifyOtpRouter());
  router.use('/phone', phoneGate);

  // Complete-onboarding: require onboarding incomplete
  const onboardingGate = express.Router();
  onboardingGate.use(requireOnboardingIncomplete);
  onboardingGate.use('/', completeOnboardingRouter());
  router.use('/', onboardingGate);

  // Status: allowed in any state (no extra gate)
  router.use('/', statusRouter());

  // Identities + unlink-google: require fully onboarded
  const postGate = express.Router();
  postGate.use(requireGateComplete);
  postGate.use('/', identitiesRouter());
  postGate.use('/', unlinkGoogleRouter());
  router.use('/', postGate);

  return router;
}
