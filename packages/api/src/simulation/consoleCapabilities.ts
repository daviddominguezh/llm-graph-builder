import type { Observability, RateLimiter, RunnerLogger } from '../capabilities/observability.js';
import { logger } from '../utils/logger.js';

/**
 * Simulation implementation of {@link RateLimiter}. Never throttles — every
 * acquire resolves immediately.
 */
export const noopRateLimit: RateLimiter = {
  acquire: async (): Promise<void> => {
    await Promise.resolve();
  },
};

/**
 * Console-backed {@link Observability}. Raw `console` is banned by the api
 * ESLint config, so events are routed through the shared `logger` proxy while
 * keeping the console-style, human-readable output shape.
 */
export const consoleObservability: Observability = {
  event: (name: string, data?: Record<string, unknown>): void => {
    logger.info(`[sim] ${name}`, data ?? {});
  },
};

/**
 * Console-backed {@link RunnerLogger}, routed through the shared `logger` proxy
 * for the same ESLint reason as {@link consoleObservability}.
 */
export const consoleLogger: RunnerLogger = {
  info: (message: string, data?: Record<string, unknown>): void => {
    logger.info(message, data ?? {});
  },
  warn: (message: string, data?: Record<string, unknown>): void => {
    logger.warn(message, data ?? {});
  },
  error: (message: string, data?: Record<string, unknown>): void => {
    logger.error(message, data ?? {});
  },
};
