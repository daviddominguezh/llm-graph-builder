import { resolveTxt as dnsResolveTxt } from 'node:dns/promises';

// Fly internal DNS: `vms.<app>.internal` returns the machine membership as a
// COMMA-SEPARATED list of "<machine_id> <region>" entries. Fly may return the
// whole list as one TXT record (comma-joined) or split across records, and a
// long record may be chunked into 255-byte pieces. We join chunks, split on
// commas, then take the first whitespace token as machine id (region optional).
export interface Member {
  machineId: string;
  region: string;
}

export interface MembershipDeps {
  resolveTxt: (host: string) => Promise<string[][]>;
  now: () => number;
  appName: string;
  localMachineId: string;
}

export interface Membership {
  list: () => Promise<Member[]>;
  localId: () => string;
}

const DEFAULT_CACHE_MS = 3_000;
const MACHINE_ID_IDX = 0;
const REGION_IDX = 1;

export function buildMembershipDeps(): MembershipDeps {
  return {
    resolveTxt: dnsResolveTxt,
    now: Date.now,
    appName: process.env.FLY_APP_NAME ?? '',
    localMachineId: process.env.FLY_MACHINE_ID ?? '',
  };
}

function parseEntry(entry: string): Member | null {
  const tokens = entry.trim().split(/\s+/v);
  const machineId = tokens[MACHINE_ID_IDX] ?? '';
  if (machineId === '') return null;
  return { machineId, region: tokens[REGION_IDX] ?? '' };
}

function parseRecord(chunks: string[]): Member[] {
  const members: Member[] = [];
  for (const entry of chunks.join('').split(',')) {
    const member = parseEntry(entry);
    if (member !== null) members.push(member);
  }
  return members;
}

export function parseTxtRecords(records: string[][]): Member[] {
  return records.flatMap(parseRecord);
}

interface CacheState {
  members: Member[];
  fetchedAt: number;
}

function isFresh(cache: CacheState | null, now: number, cacheMs: number): cache is CacheState {
  return cache !== null && now - cache.fetchedAt < cacheMs;
}

export function createMembership(deps: MembershipDeps, cacheMs: number = DEFAULT_CACHE_MS): Membership {
  const box: { cache: CacheState | null } = { cache: null };
  const store = (next: CacheState): Member[] => {
    box.cache = next;
    return next.members;
  };
  const refresh = async (): Promise<CacheState> => {
    const records = await deps.resolveTxt(`vms.${deps.appName}.internal`);
    return { members: parseTxtRecords(records), fetchedAt: deps.now() };
  };
  const list = async (): Promise<Member[]> => {
    if (isFresh(box.cache, deps.now(), cacheMs)) return box.cache.members;
    return store(await refresh());
  };
  return { list, localId: () => deps.localMachineId };
}
