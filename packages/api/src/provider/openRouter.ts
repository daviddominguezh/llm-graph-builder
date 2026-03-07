import { type OpenRouterProvider, createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

const createOpenRouterProvider = (): OpenRouterProvider =>
  createOpenRouter({
    apiKey: 'YOUR_OPENROUTER_API_KEY',
  });

export const getOpenRouterModel = (model: string): LanguageModel => createOpenRouterProvider().chat(model);
