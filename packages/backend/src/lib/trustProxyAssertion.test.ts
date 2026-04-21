import { describe, expect, it } from '@jest/globals';
import express from 'express';

import { assertTrustProxy } from './trustProxyAssertion.js';

const TRUST_ONE_PROXY = 1;
const TRUST_NO_PROXY = 0;

describe('assertTrustProxy', () => {
  it('passes when trust proxy = 1 resolves first XFF hop', () => {
    const app = express();
    app.set('trust proxy', TRUST_ONE_PROXY);
    expect(() => {
      assertTrustProxy(app, { xff: '1.2.3.4, 5.6.7.8', expectedIp: '5.6.7.8' });
    }).not.toThrow();
  });
  it('throws when configuration is wrong', () => {
    const app = express();
    app.set('trust proxy', TRUST_NO_PROXY);
    expect(() => {
      assertTrustProxy(app, { xff: '1.2.3.4, 5.6.7.8', expectedIp: '5.6.7.8' });
    }).toThrow();
  });
});
