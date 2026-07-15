import type { Operation } from '@daviddh/graph-types';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import type { SupabaseClient } from '../../../db/queries/operationHelpers.js';
import { HTTP_BAD_REQUEST, HTTP_INTERNAL_ERROR, HTTP_OK, type AuthenticatedResponse } from '../../routeHelpers.js';

const mockExecuteOperationsBatch =
  jest.fn<(sb: SupabaseClient, agentId: string, ops: Operation[]) => Promise<void>>();

jest.unstable_mockModule('../../../db/queries/operationExecutor.js', () => ({
  executeOperationsBatch: mockExecuteOperationsBatch,
}));

const { handlePostOperations } = await import('../postOperations.js');

const AGENT_ID = 'agent-1';

function appWith(): express.Express {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    Object.assign(res.locals, { supabase: { from: jest.fn() }, userId: 'u1' });
    next();
  });
  app.post('/agents/:agentId/operations', (req, res: AuthenticatedResponse) => {
    void handlePostOperations(req, res);
  });
  app.post('/operations', (req, res: AuthenticatedResponse) => {
    void handlePostOperations(req, res);
  });
  return app;
}

let stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);

beforeEach(() => {
  stderrSpy = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('handlePostOperations', () => {
  it('returns 400 when the agent id is missing', async () => {
    const res = await request(appWith()).post('/operations').send({ operations: [] });
    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toEqual({ error: 'Agent ID is required' });
    expect(mockExecuteOperationsBatch).not.toHaveBeenCalled();
  });

  it('returns 400 when the body fails validation', async () => {
    const res = await request(appWith())
      .post(`/agents/${AGENT_ID}/operations`)
      .send({ operations: 'not-an-array' });
    expect(res.status).toBe(HTTP_BAD_REQUEST);
    expect(res.body).toMatchObject({ error: expect.any(String) });
    expect(mockExecuteOperationsBatch).not.toHaveBeenCalled();
  });

  it('executes the batch and returns 200 on a valid body', async () => {
    const res = await request(appWith())
      .post(`/agents/${AGENT_ID}/operations`)
      .send({ operations: [] });
    expect(res.status).toBe(HTTP_OK);
    expect(res.body).toEqual({ success: true });
    expect(mockExecuteOperationsBatch).toHaveBeenCalledWith(expect.anything(), AGENT_ID, []);
  });

  it('returns 500 and logs when the executor throws', async () => {
    mockExecuteOperationsBatch.mockRejectedValueOnce(new Error('exec-boom'));
    const res = await request(appWith())
      .post(`/agents/${AGENT_ID}/operations`)
      .send({ operations: [] });
    expect(res.status).toBe(HTTP_INTERNAL_ERROR);
    expect(res.body).toEqual({ error: 'exec-boom' });
    expect(stderrSpy).toHaveBeenCalled();
  });
});
