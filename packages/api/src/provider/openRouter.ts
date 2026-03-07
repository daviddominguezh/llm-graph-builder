import { type OpenRouterProvider, createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

const createOpenRouterProvider = (key: string): OpenRouterProvider =>
  createOpenRouter({
    apiKey: key,
  });

export const getOpenRouterModel = (key: string, model: string): LanguageModel =>
  createOpenRouterProvider(key).chat(model);
