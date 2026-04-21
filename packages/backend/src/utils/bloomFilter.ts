const BLOOM_SIZE = 9600;
const NUM_HASHES = 7;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const UINT32_MASK = 0xffffffff;
const ZERO = 0;
const ONE = 1;
const UNSIGNED_SHIFT = 0;

function fnv1a(input: string, seed: number): number {
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> UNSIGNED_SHIFT;
  for (let i = ZERO; i < input.length; i += ONE) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> UNSIGNED_SHIFT;
  }
  return hash >>> UNSIGNED_SHIFT;
}

function seedForDoubleHash(h1: number): number {
  return h1 === ZERO ? ONE : h1;
}

export function computeBloomPositions(slug: string): number[] {
  const h1 = fnv1a(slug, ZERO);
  const h2 = fnv1a(slug, seedForDoubleHash(h1));
  const positions: number[] = [];
  for (let i = ZERO; i < NUM_HASHES; i += ONE) {
    const combined = ((h1 + Math.imul(i, h2)) & UINT32_MASK) >>> UNSIGNED_SHIFT;
    positions.push(combined % BLOOM_SIZE);
  }
  return positions;
}

export function buildBitmask(slug: string): string {
  const bits = new Uint8Array(BLOOM_SIZE);
  const positions = computeBloomPositions(slug);
  for (const pos of positions) {
    bits[pos] = ONE;
  }
  return Array.from(bits).join('');
}
