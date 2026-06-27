import type { Member, Membership } from './membership.js';
import { buildRing } from './ring.js';

// Routing decision for an MCP pool key under consistent hashing:
//   - owner === self            → handle LOCALLY
//   - owner === another machine → reply with a `fly-replay` header (kind: 'replay')
//   - owner dead/unreachable    → forward over 6PN, then re-route to the next owner
export type RouteDecision =
  | { kind: 'local' }
  | { kind: 'replay'; machineId: string }
  | { kind: 'forward'; machineId: string };

/** Thrown when, after dropping a dead owner, the key re-routes back to this machine. */
export class HandleLocallyError extends Error {
  constructor() {
    super('owner resolved to this machine after reroute');
    this.name = 'HandleLocallyError';
  }
}

interface DecideArgs {
  poolKey: string;
  members: Member[];
  localId: string;
}

interface ForwardArgs extends DecideArgs {
  forward: (machineId: string) => Promise<Response>;
}

function ownerFor(members: Member[], poolKey: string): string | null {
  return buildRing(members.map((m) => m.machineId)).ownerFor(poolKey);
}

export function decideRoute(args: DecideArgs): RouteDecision {
  const owner = ownerFor(args.members, args.poolKey);
  if (owner === null || owner === args.localId) return { kind: 'local' };
  return { kind: 'replay', machineId: owner };
}

export async function forwardWithReroute(args: ForwardArgs): Promise<Response> {
  const owner = ownerFor(args.members, args.poolKey);
  if (owner === null || owner === args.localId) throw new HandleLocallyError();
  try {
    return await args.forward(owner);
  } catch {
    const reduced = args.members.filter((m) => m.machineId !== owner);
    const next = ownerFor(reduced, args.poolKey);
    if (next === null || next === args.localId) throw new HandleLocallyError();
    return await args.forward(next);
  }
}

// Transient membership-resolution failures (Fly internal-DNS NXDOMAIN/timeout)
// must NOT take down routing. Fall back to a local-only membership so the ring
// resolves owner === self and the request is handled locally, rather than
// throwing and dropping the connection.
export async function resolveMembers(membership: Membership): Promise<Member[]> {
  try {
    return await membership.list();
  } catch {
    return [{ machineId: membership.localId(), region: '' }];
  }
}
