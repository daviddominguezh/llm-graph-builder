import type { CompletionConfig, CompletionNotifier } from './completionNotifier.js';

let notifierInstance: CompletionNotifier | null = null;
let configInstance: CompletionConfig | null = null;

export function setNotifier(notifier: CompletionNotifier, config: CompletionConfig): void {
  notifierInstance = notifier;
  configInstance = config;
}

export function getNotifier(): CompletionNotifier {
  if (notifierInstance === null) {
    throw new Error('CompletionNotifier not initialized — call setNotifier() during startup');
  }
  return notifierInstance;
}

export function getCompletionConfig(): CompletionConfig {
  if (configInstance === null) {
    throw new Error('CompletionConfig not initialized — call setNotifier() during startup');
  }
  return configInstance;
}
