import type express from 'express';

import type { RerankedRecord } from '../../../rag/rerank.js';

export const HTTP_OK = 200;
export const HTTP_BAD = 400;
export const HTTP_UNAUTHORIZED = 401;

export const AUTH = { 'x-master-key': 'test-key' };

interface BodyShape {
  ok?: boolean;
  error?: string;
  vector?: number[];
  records?: RerankedRecord[];
}

function isBodyShape(value: unknown): value is BodyShape {
  if (typeof value !== 'object' || value === null) return false;
  return true;
}

export function asBody(value: unknown): BodyShape {
  if (isBodyShape(value)) return value;
  return {};
}

export function buildApp(internalRouter: express.Router, expressLib: typeof express): express.Express {
  const app = expressLib();
  app.use(expressLib.json());
  app.use('/internal', internalRouter);
  return app;
}
