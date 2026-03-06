interface LeveledLogMethod {
  (message: string, ...meta: unknown[]): unknown;
  (message: unknown): unknown;
}

export interface Logger {
  error: LeveledLogMethod;
  warn: LeveledLogMethod;
  help: LeveledLogMethod;
  data: LeveledLogMethod;
  info: LeveledLogMethod;
  debug: LeveledLogMethod;
  prompt: LeveledLogMethod;
  http: LeveledLogMethod;
  verbose: LeveledLogMethod;
  input: LeveledLogMethod;
  silly: LeveledLogMethod;
}

const noop: LeveledLogMethod = () => undefined;

const noopLogger: Logger = {
  error: noop,
  warn: noop,
  help: noop,
  data: noop,
  info: noop,
  debug: noop,
  prompt: noop,
  http: noop,
  verbose: noop,
  input: noop,
  silly: noop,
};

let currentLogger: Logger = noopLogger;

export const setLogger = (instance: Logger): void => {
  currentLogger = instance;
};

export const logger: Logger = new Proxy(noopLogger, {
  get(_target, prop: keyof Logger) {
    return currentLogger[prop];
  },
});
