import type { Tool } from 'ai';

import type { Context } from '@src/types/tools.js';

import { GreetingTools } from './greeting.js';

type ToolCallback = (context: Context) => Record<string, Tool>;

export const generateAllTools: ToolCallback = (context: Context) => ({
  ...GreetingTools.generate(context),
});
