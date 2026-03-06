import type { Context } from '@src/types/tools.js';

export const CONTEXT_PRECONDITIONS: Record<string, (context: Context) => Promise<boolean>> = {
  USER_HAS_NAME: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.data.userName !== undefined && context.data.userName !== ''),

  NO_USER_HAS_NAME: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.data.userName === undefined || context.data.userName === ''),
};
