import type { ContextPrecondition } from '@src/types/graph.js';
import type { Context } from '@src/types/tools.js';

export const CONTEXT_PRECONDITIONS: Record<ContextPrecondition, (context: Context) => Promise<boolean>> = {
  USER_HAS_NAME: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.userName !== undefined && context.userName !== ''),

  NO_USER_HAS_NAME: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.userName === undefined || context.userName === ''),
};
