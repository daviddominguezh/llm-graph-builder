import { setByJsonPointer } from './jsonPointer.js';
import type { DeepReadonly } from './types.js';

function isFreezable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Object.isFrozen(value);
}

export function deepFreeze<T>(value: T): T {
  if (isFreezable(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export interface SimStatePatch {
  tool: string;
  path: string;
  value: unknown;
}

export interface SimStateStore {
  read: () => DeepReadonly<Record<string, unknown>>;
  write: (tool: string, path: string, value: unknown) => SimStatePatch | null;
  snapshot: () => Record<string, unknown>;
  patches: () => SimStatePatch[];
}

export function createSimStateStore(
  initial: Record<string, unknown>,
  writable: boolean
): SimStateStore {
  let authoritative: Record<string, unknown> = structuredClone(initial);
  const recorded: SimStatePatch[] = [];

  function read(): DeepReadonly<Record<string, unknown>> {
    return deepFreeze(structuredClone(authoritative)) as DeepReadonly<Record<string, unknown>>;
  }

  function write(tool: string, path: string, value: unknown): SimStatePatch | null {
    if (!writable) return null;
    const cloned = structuredClone(value);
    authoritative = setByJsonPointer(authoritative, path, cloned);
    const patch: SimStatePatch = { tool, path, value: cloned };
    recorded.push(patch);
    return patch;
  }

  return {
    read,
    write,
    snapshot: () => structuredClone(authoritative),
    patches: () => recorded.slice(),
  };
}
