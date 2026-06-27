const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;
const DEFAULT_VNODES = 150;

const FIRST_INDEX = 0;
const STEP = 1;
const TO_UINT32 = 0;

export function hashKey(s: string): number {
  let h = FNV_OFFSET;
  for (let i = FIRST_INDEX; i < s.length; i += STEP) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> TO_UINT32;
}

export interface Ring {
  ownerFor: (poolKey: string) => string | null;
}

interface VNode {
  hash: number;
  machineId: string;
}

function buildVnodes(machineIds: string[], vnodes: number): VNode[] {
  const out: VNode[] = [];
  for (const id of machineIds) {
    for (let v = FIRST_INDEX; v < vnodes; v += STEP) {
      out.push({ hash: hashKey(`${id}#${String(v)}`), machineId: id });
    }
  }
  out.sort((a, b) => a.hash - b.hash);
  return out;
}

/** First vnode clockwise from `h`, wrapping to the ring head. `ring` is non-empty. */
function firstClockwise(ring: VNode[], h: number): string | null {
  for (const node of ring) {
    if (node.hash >= h) return node.machineId;
  }
  const [head] = ring;
  return head === undefined ? null : head.machineId;
}

export function buildRing(machineIds: string[], vnodes: number = DEFAULT_VNODES): Ring {
  const ring = buildVnodes(machineIds, vnodes);
  return {
    ownerFor: (poolKey) => {
      if (ring.length === FIRST_INDEX) return null;
      return firstClockwise(ring, hashKey(poolKey));
    },
  };
}
