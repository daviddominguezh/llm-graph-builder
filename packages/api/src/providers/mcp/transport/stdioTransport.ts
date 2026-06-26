import type { ChildProcessWithoutNullStreams, spawn as SpawnFnImported } from 'node:child_process';

import { TransportError } from './errors.js';
import { buildNotification, buildRequest, isJsonRpcNotification, isJsonRpcResponse } from './jsonRpc.js';
import { PendingMap } from './sseState.js';
import { dispatchJsonValue } from './stdioDispatch.js';
import { DEFAULT_REQUEST_TIMEOUT_MS, type McpTransport, type TransportOptions } from './transport.js';

const FIRST_ID = 1;
const ID_INCREMENT = 1;

export interface StdioTransportConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

type ChildProcessLike = ChildProcessWithoutNullStreams;
type SpawnFn = typeof SpawnFnImported;

function isNodeRuntime(): boolean {
  if (typeof process === 'undefined') return false;
  return typeof process.versions.node === 'string';
}

function isSpawnFn(fn: unknown): fn is SpawnFn {
  return typeof fn === 'function';
}

async function loadSpawn(): Promise<SpawnFn> {
  const mod = await import('node:child_process');
  if (!isSpawnFn(mod.spawn)) {
    throw new TransportError('node:child_process.spawn unavailable');
  }
  return mod.spawn;
}

function parseLine(line: string): unknown {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    throw new TransportError('Invalid JSON on stdio line', err);
  }
}

function spawnChild(spawn: SpawnFn, config: StdioTransportConfig): ChildProcessLike {
  const env = { ...process.env, ...(config.env ?? {}) };
  const args = config.args ?? [];
  return spawn(config.command, args, { env });
}

function writeToChild(child: ChildProcessLike, body: unknown): void {
  const serialized = JSON.stringify(body);
  child.stdin.write(`${serialized}\n`);
}

async function awaitResponse(pending: PendingMap, id: number, timeoutMs: number): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  const timer = setTimeout(() => {
    pending.reject(id, new TransportError('stdio request timed out'));
  }, timeoutMs);
  pending.add(
    id,
    (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    (reason) => {
      clearTimeout(timer);
      reject(reason instanceof Error ? reason : new TransportError(String(reason)));
    }
  );
  return await promise;
}

interface ReaderConfig {
  child: ChildProcessLike;
  pending: PendingMap;
  options: TransportOptions;
  onLine: (line: string) => void;
}

function attachStdoutReader(cfg: ReaderConfig, applyLine: (line: string) => void): void {
  let buffer = '';
  cfg.child.stdout.on('data', (data: Buffer) => {
    buffer += data.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) applyLine(line);
  });
}

function attachExitHandlers(child: ChildProcessLike, pending: PendingMap, onClose: () => void): void {
  child.on('exit', () => {
    pending.rejectAll(new TransportError('stdio child process exited'));
    onClose();
  });
  child.on('error', (err: Error) => {
    pending.rejectAll(new TransportError('stdio child process error', err));
  });
}

function makeLineProcessor(pending: PendingMap, options: TransportOptions): (line: string) => void {
  return (line) => {
    const parsed = parseLine(line);
    if (parsed === null) return;
    dispatchJsonValue({
      parsed,
      pending,
      onNotification: options.onNotification,
      isResponse: isJsonRpcResponse,
      isNotification: isJsonRpcNotification,
    });
  };
}

interface StdioRuntime {
  child: ChildProcessLike;
  pending: PendingMap;
  options: TransportOptions;
  timeoutMs: number;
}

function makeRequestFn(rt: StdioRuntime): (method: string, params?: unknown) => Promise<unknown> {
  let nextId = FIRST_ID;
  return async (method, params) => {
    const id = nextId;
    nextId += ID_INCREMENT;
    const reqBody = buildRequest(id, method, params);
    const responsePromise = awaitResponse(rt.pending, id, rt.timeoutMs);
    writeToChild(rt.child, reqBody);
    return await responsePromise;
  };
}

function makeNotifyFn(rt: StdioRuntime): (method: string, params?: unknown) => Promise<void> {
  return async (method, params): Promise<void> => {
    const body = buildNotification(method, params);
    writeToChild(rt.child, body);
    await Promise.resolve();
  };
}

function makeCloseFn(rt: StdioRuntime, isClosed: () => boolean, markClosed: () => void): () => Promise<void> {
  return async () => {
    if (isClosed()) return;
    markClosed();
    rt.pending.rejectAll(new TransportError('stdio transport closed'));
    try {
      rt.child.kill();
    } catch {
      // ignore
    }
    await Promise.resolve();
  };
}

function buildTransport(rt: StdioRuntime): McpTransport {
  let closed = false;
  const isClosed = (): boolean => closed;
  const markClosed = (): void => {
    closed = true;
  };
  attachStdoutReader(
    { child: rt.child, pending: rt.pending, options: rt.options, onLine: () => undefined },
    makeLineProcessor(rt.pending, rt.options)
  );
  attachExitHandlers(rt.child, rt.pending, markClosed);
  return {
    request: makeRequestFn(rt),
    notify: makeNotifyFn(rt),
    get sessionId(): string | null {
      return null;
    },
    setSessionId(): void {
      // stdio has no session
    },
    close: makeCloseFn(rt, isClosed, markClosed),
  };
}

/**
 * Create a stdio MCP transport. Spawns the configured child process and
 * frames JSON-RPC over stdin/stdout (newline-delimited JSON).
 *
 * Node-only: dynamic-imports `node:child_process` so this module is safe to
 * include in Deno bundles. Throws if invoked from a non-Node runtime.
 */
export async function createStdioTransport(
  config: StdioTransportConfig,
  options: TransportOptions = {}
): Promise<McpTransport> {
  if (!isNodeRuntime()) throw new TransportError('stdio transport requires Node.js');
  const spawn = await loadSpawn();
  const rt: StdioRuntime = {
    child: spawnChild(spawn, config),
    pending: new PendingMap(),
    options,
    timeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };
  return buildTransport(rt);
}
