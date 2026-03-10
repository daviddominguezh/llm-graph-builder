import type { Logger } from '@daviddh/llm-graph-runner';

function makeLogFn(prefix: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    console.log(`[runner:${prefix}]`, ...args);
  };
}

export const consoleLogger: Logger = {
  error: makeLogFn('error'),
  warn: makeLogFn('warn'),
  help: makeLogFn('help'),
  data: makeLogFn('data'),
  info: makeLogFn('info'),
  debug: makeLogFn('debug'),
  prompt: makeLogFn('prompt'),
  http: makeLogFn('http'),
  verbose: makeLogFn('verbose'),
  input: makeLogFn('input'),
  silly: makeLogFn('silly'),
};
