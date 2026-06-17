import type { Request, Response } from 'express';

import { createServiceClient } from '../../../db/queries/executionAuthQueries.js';
import { makeKvStoreService } from '../../../services/kvStoreService.js';
import { parseOrReject, runTool } from './responder.js';
import {
  GetValuesBodySchema,
  KvSearchBodySchema,
  ListKeysBodySchema,
  UpdateValueBodySchema,
} from './schemas.js';

export async function handleKvListKeys(req: Request, res: Response): Promise<void> {
  const body = parseOrReject(res, ListKeysBodySchema.safeParse(req.body));
  if (body === null) return;
  const svc = makeKvStoreService(createServiceClient(), body.storeId);
  await runTool(res, async () => await svc.listKeys(body.tenantId, body.offset, body.limit));
}

export async function handleKvGetValues(req: Request, res: Response): Promise<void> {
  const body = parseOrReject(res, GetValuesBodySchema.safeParse(req.body));
  if (body === null) return;
  const svc = makeKvStoreService(createServiceClient(), body.storeId);
  await runTool(res, async () => await svc.getValues(body.tenantId, body.keys));
}

export async function handleKvSearch(req: Request, res: Response): Promise<void> {
  const body = parseOrReject(res, KvSearchBodySchema.safeParse(req.body));
  if (body === null) return;
  const svc = makeKvStoreService(createServiceClient(), body.storeId);
  if (body.mode === 'substring') {
    await runTool(
      res,
      async () =>
        await svc.searchSubstring({
          tenantId: body.tenantId,
          on: body.on,
          query: body.query,
          offset: body.offset,
          limit: body.limit,
        })
    );
    return;
  }
  await runTool(
    res,
    async () =>
      await svc.searchRegex({
        tenantId: body.tenantId,
        on: body.on,
        pattern: body.pattern,
        offset: body.offset,
        limit: body.limit,
      })
  );
}

export async function handleKvUpdateValue(req: Request, res: Response): Promise<void> {
  const body = parseOrReject(res, UpdateValueBodySchema.safeParse(req.body));
  if (body === null) return;
  const svc = makeKvStoreService(createServiceClient(), body.storeId);
  await runTool(res, async () => await svc.updateValue(body.tenantId, body.key, body.value));
}
