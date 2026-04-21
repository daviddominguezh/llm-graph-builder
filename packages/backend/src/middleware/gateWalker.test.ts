import { describe, expect, it, jest } from '@jest/globals';
import express from 'express';

import { assertGateCoverage } from './gateWalker.js';

const requireAuth = jest.fn();
const requireGateComplete = jest.fn();
const requirePhoneUnverified = jest.fn();

describe('assertGateCoverage - happy paths', () => {
  it('passes when mutating app route has requireAuth then requireGateComplete', () => {
    const app = express();
    app.post('/widget', requireAuth, requireGateComplete, (_req, res) => {
      void res.end();
    });
    expect(() => {
      assertGateCoverage(app, { requireAuth, gates: [requireGateComplete, requirePhoneUnverified] });
    }).not.toThrow();
  });

  it('allowlists AUTH_PUBLIC_UNAUTHED (no auth, no gate)', () => {
    const app = express();
    app.post('/auth/public/lookup-email', (_req, res) => {
      void res.end();
    });
    expect(() => {
      assertGateCoverage(app, {
        requireAuth,
        gates: [requireGateComplete],
        publicUnauthed: ['/auth/public/lookup-email'],
      });
    }).not.toThrow();
  });

  it('passes AUTH_PUBLIC_AUTHED when requireAuth is present', () => {
    const app = express();
    app.post('/auth/public/handle-oauth-duplicate', requireAuth, (_req, res) => {
      void res.end();
    });
    expect(() => {
      assertGateCoverage(app, {
        requireAuth,
        gates: [requireGateComplete],
        publicAuthed: ['/auth/public/handle-oauth-duplicate'],
      });
    }).not.toThrow();
  });
});

describe('assertGateCoverage - error cases', () => {
  it('throws when gate middleware is missing', () => {
    const app = express();
    app.post('/widget', requireAuth, (_req, res) => {
      void res.end();
    });
    expect(() => {
      assertGateCoverage(app, { requireAuth, gates: [requireGateComplete] });
    }).toThrow(/widget/v);
  });

  it('throws when middleware order is wrong (gate before auth)', () => {
    const app = express();
    app.post('/widget', requireGateComplete, requireAuth, (_req, res) => {
      void res.end();
    });
    expect(() => {
      assertGateCoverage(app, { requireAuth, gates: [requireGateComplete] });
    }).toThrow();
  });

  it('requires requireAuth on AUTH_PUBLIC_AUTHED', () => {
    const app = express();
    app.post('/auth/public/handle-oauth-duplicate', (_req, res) => {
      void res.end();
    });
    expect(() => {
      assertGateCoverage(app, {
        requireAuth,
        gates: [requireGateComplete],
        publicAuthed: ['/auth/public/handle-oauth-duplicate'],
      });
    }).toThrow(/requireAuth/v);
  });
});
