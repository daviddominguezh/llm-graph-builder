import type { Express } from 'express';

type TrustFn = (addr: string, i: number) => boolean;

interface AssertionInput {
  xff: string;
  expectedIp: string;
  remoteAddr?: string;
}

const ZERO = 0;
const ONE = 1;

function isTrustFn(value: unknown): value is TrustFn {
  return typeof value === 'function';
}

function buildAddrList(remoteAddr: string, xff: string): string[] {
  const xffAddrs = xff
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > ZERO);
  return [...xffAddrs, remoteAddr];
}

function resolveClientIp(remoteAddr: string, xff: string, trustFn: TrustFn): string {
  const addrs = buildAddrList(remoteAddr, xff);
  let hopIdx = ZERO;
  let clientIp = remoteAddr;

  for (let i = addrs.length - ONE; i >= ZERO; i -= ONE) {
    const addr = addrs[i] ?? remoteAddr;
    if (!trustFn(addr, hopIdx)) break;
    clientIp = addrs[i - ONE] ?? addr;
    hopIdx += ONE;
  }

  return clientIp;
}

export function assertTrustProxy(app: Express, input: AssertionInput): void {
  const remoteAddr = input.remoteAddr ?? '127.0.0.1';
  const rawTrustFn: unknown = app.get('trust proxy fn');
  if (!isTrustFn(rawTrustFn)) {
    throw new Error('Trust proxy function not configured on Express app');
  }
  const actual = resolveClientIp(remoteAddr, input.xff, rawTrustFn);
  if (actual !== input.expectedIp) {
    throw new Error(`Trust-proxy misconfigured: expected ${input.expectedIp}, got ${actual}`);
  }
}
