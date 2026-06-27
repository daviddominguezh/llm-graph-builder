import { resolveTxt as dnsResolveTxt } from 'node:dns/promises';

// Fly internal DNS: `vms.<app>.internal` returns one TXT record per running
// machine, each formatted "<machine_id> <region>" (per Fly's 6PN/.internal
// docs). We parse defensively (first token = machine id) and document the
// assumption; confirm the exact format against a real Fly deploy before prod.
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

export function parseTxtRecords(records: string[][]): Member[] {
  const out: Member[] = [];
  for (const chunks of records) {
    const tokens = chunks.join('').trim().split(/\s+/v);
    const machineId = tokens[MACHINE_ID_IDX] ?? '';
    if (machineId === '') continue;
    out.push({ machineId, region: tokens[REGION_IDX] ?? '' });
  }
  return out;
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
