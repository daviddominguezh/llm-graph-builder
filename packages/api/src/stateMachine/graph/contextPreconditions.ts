import { readCart } from '@services/firebase/carrito.js';

import type { ContextPrecondition } from '@src/flowGenerator/src/types/mermaid.js';

import type { Context } from '@globalTypes/ai/tools.js';

import { FIRST_INDEX } from '@constants/index.js';

export const CONTEXT_PRECONDITIONS: Record<ContextPrecondition, (context: Context) => Promise<boolean>> = {
  USER_HAS_NAME: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.userName !== undefined && context.userName !== ''),

  NO_USER_HAS_NAME: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.userName === undefined || context.userName === ''),

  USER_HAS_NONEMPTY_CART: async (context: Context): Promise<boolean> => {
    const cart = await readCart(context.userID, context.namespace);
    return (cart.items ?? []).length > FIRST_INDEX;
  },

  USER_HAS_EMPTY_CART: async (context: Context): Promise<boolean> => {
    const cart = await readCart(context.userID, context.namespace);
    return (cart.items ?? []).length === FIRST_INDEX;
  },

  ASK_GENDER: async (context: Context): Promise<boolean> =>
    await Promise.resolve(
      context.namespace === 'nike' &&
        (context.gender === undefined || context.gender === '')
    ),

  NO_ASK_GENDER: async (context: Context): Promise<boolean> =>
    await Promise.resolve(
      context.namespace === 'nike' &&
        context.gender !== undefined &&
        context.gender !== ''
    ),

  // TODO: This is wrong, must be project specific
  NEVER_ASK_GENDER: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.namespace !== 'nike'),

  ASK_OCCASION: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.occasion === undefined || context.occasion === ''),

  NO_ASK_OCCASION: async (context: Context): Promise<boolean> =>
    await Promise.resolve(context.occasion !== undefined && context.occasion !== ''),

  NEVER_ASK_OCCASION: async (): Promise<boolean> => await Promise.resolve(false),

  ALWAYS_TRUE: async (): Promise<boolean> => await Promise.resolve(true),
};
