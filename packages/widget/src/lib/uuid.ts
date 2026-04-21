const UUID_BYTES = 16;
const VERSION_BYTE_INDEX = 6;
const VERSION_MASK = 0x0f;
const VERSION_4_FLAG = 0x40;
const VARIANT_BYTE_INDEX = 8;
const VARIANT_MASK = 0x3f;
const VARIANT_RFC4122_FLAG = 0x80;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;
const GROUP_0_START = 0;
const GROUP_1_END = 8;
const GROUP_2_END = 12;
const GROUP_3_END = 16;
const GROUP_4_END = 20;
const BASE36_RADIX = 36;
const RANDOM_SUFFIX_START = 2;
const BYTE_FALLBACK = 0;

export function randomUUID(): string {
  const { crypto: c } = globalThis as { crypto?: Crypto };
  if (c?.randomUUID !== undefined) return c.randomUUID();
  if (c?.getRandomValues !== undefined) return buildUuidFromBytes(c);
  return buildFallback();
}

function buildUuidFromBytes(c: Crypto): string {
  const b = new Uint8Array(UUID_BYTES);
  c.getRandomValues(b);
  b[VERSION_BYTE_INDEX] = ((b[VERSION_BYTE_INDEX] ?? BYTE_FALLBACK) & VERSION_MASK) | VERSION_4_FLAG;
  b[VARIANT_BYTE_INDEX] = ((b[VARIANT_BYTE_INDEX] ?? BYTE_FALLBACK) & VARIANT_MASK) | VARIANT_RFC4122_FLAG;
  const h = Array.from(b, (x) => x.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, '0')).join('');
  return `${h.slice(GROUP_0_START, GROUP_1_END)}-${h.slice(GROUP_1_END, GROUP_2_END)}-${h.slice(GROUP_2_END, GROUP_3_END)}-${h.slice(GROUP_3_END, GROUP_4_END)}-${h.slice(GROUP_4_END)}`;
}

function buildFallback(): string {
  return `fallback-${Date.now().toString(BASE36_RADIX)}-${Math.random().toString(BASE36_RADIX).slice(RANDOM_SUFFIX_START)}`;
}
