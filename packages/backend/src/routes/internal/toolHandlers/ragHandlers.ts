import type { KvPagedResult, RagStoreServices } from '@daviddh/llm-graph-runner';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../../db/queries/executionAuthQueries.js';
import { makeRagStoreService } from '../../../services/ragStoreService.js';
import { parseOrReject, runTool } from './responder.js';
import { type RagSearchBody, RagSearchBodySchema } from './schemas.js';

async function dispatchRagSearch(svc: RagStoreServices, body: RagSearchBody): Promise<KvPagedResult<string>> {
  if (body.mode === 'bm25') {
    return await svc.searchBm25(body.tenantId, body.query, body.offset, body.limit);
  }
  if (body.mode === 'semantic') {
    return await svc.searchSemantic({
      tenantId: body.tenantId,
      query: body.query,
      minSimilarity: body.minSimilarity,
      offset: body.offset,
      limit: body.limit,
    });
  }
  if (body.mode === 'hybrid') {
    return await svc.searchHybrid({
      tenantId: body.tenantId,
      query: body.query,
      minSimilarity: body.minSimilarity,
      offset: body.offset,
      limit: body.limit,
    });
  }
  return await svc.searchRegex({
    tenantId: body.tenantId,
    pattern: body.pattern,
    offset: body.offset,
    limit: body.limit,
  });
}

export async function handleRagSearch(req: Request, res: Response): Promise<void> {
  const body = parseOrReject(res, RagSearchBodySchema.safeParse(req.body));
  if (body === null) return;
  const svc = makeRagStoreService(createServiceClient(), body.storeId);
  await runTool(res, async () => await dispatchRagSearch(svc, body));
}
