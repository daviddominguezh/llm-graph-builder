const ZERO = 0;
const ONE = 1;
const ARRAY_SLOT_PATTERN = /\[\]/gv;

export const ARRAY_EXPANSION_CAP = 50;

export interface ExpandResult {
  columns: string[];
  truncated: boolean;
}

function processPath(p: string, obs: number, budget: number): { columns: string[]; truncated: boolean } {
  const slots = countSlots(p);

  if (slots === ZERO) {
    return { columns: [p], truncated: false };
  }

  const perms = enumeratePermutations(obs, slots, budget);
  const pathColumns: string[] = [];

  for (const indices of perms) {
    pathColumns.push(subst(p, indices));
  }

  let pathTruncated = false;
  if (perms.length === ZERO || obs > perms.length) {
    pathTruncated = true;
    const suffixArray = buildSuffixArray(slots, budget);
    pathColumns.push(subst(p, suffixArray));
  }

  return { columns: pathColumns, truncated: pathTruncated };
}

function buildSuffixArray(slots: number, budget: number): Array<string | number> {
  const suffixArray: Array<string | number> = [];
  for (let j = ZERO; j < slots; j += ONE) {
    suffixArray.push(`${String(budget)}+`);
  }
  return suffixArray;
}

export function expandArrayColumns(paths: string[], observedMax: Record<string, number>): ExpandResult {
  const columns: string[] = [];
  let truncated = false;

  for (const p of paths) {
    const obs = observedMax[p] ?? ZERO;
    const budget = ARRAY_EXPANSION_CAP;
    const result = processPath(p, obs, budget);
    columns.push(...result.columns);
    if (result.truncated) {
      truncated = true;
    }
  }

  return { columns, truncated };
}

function countSlots(p: string): number {
  const matches = p.match(ARRAY_SLOT_PATTERN) ?? [];
  return matches.length;
}

function subst(p: string, idx: Array<number | string>): string {
  let i = ZERO;
  const replacement = p.replace(ARRAY_SLOT_PATTERN, () => {
    const result = `[${String(idx[i])}]`;
    i += ONE;
    return result;
  });
  return replacement;
}

function enumeratePermutations(max: number, depth: number, budget: number): number[][] {
  if (max === ZERO || depth === ZERO || budget === ZERO) {
    return depth === ZERO ? [[]] : [];
  }

  const out: number[][] = [];
  const perDim = Math.ceil(budget ** (ONE / depth));
  const cap = Math.min(max, perDim);

  for (let i = ZERO; i < cap && out.length < budget; i += ONE) {
    const nextDepth = depth - ONE;
    const nextBudget = budget - out.length;
    const restPerms = enumeratePermutations(cap, nextDepth, nextBudget);
    addPermutationsWithIndex(out, i, restPerms, budget);
  }

  return out.slice(ZERO, budget);
}

function addPermutationsWithIndex(
  out: number[][],
  index: number,
  restPerms: number[][],
  budget: number
): void {
  for (const rest of restPerms) {
    out.push([index, ...rest]);
    if (out.length >= budget) break;
  }
}
