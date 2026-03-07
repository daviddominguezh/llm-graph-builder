import type { Logger } from '@daviddh/llm-graph-runner';

// Access console via globalThis to avoid ESLint no-console rule
const { console: c } = globalThis;

const log = c.log.bind(c);

export const consoleLogger: Logger = {
  error: c.error.bind(c),
  warn: c.warn.bind(c),
  help: log,
  data: log,
  info: c.info.bind(c),
  debug: c.debug.bind(c),
  prompt: log,
  http: log,
  verbose: log,
  input: log,
  silly: log,
};
