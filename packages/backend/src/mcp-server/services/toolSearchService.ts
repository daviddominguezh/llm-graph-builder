import type { CatalogEntry } from './toolCatalogBuilder.js';

const MAX_RESULTS = 5;
const EXACT_NAME_BONUS = 1000;
const NAME_CONTAINS_SCORE = 50;
const CATEGORY_SCORE = 40;
const DESCRIPTION_SCORE = 30;
const PARAM_NAME_SCORE = 20;
const PARAM_DESC_SCORE = 10;
const MIN_SCORE = 0;

export interface SearchResult {
  name: string;
  description: string;
  category: string;
}

export interface SchemaResult {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
}

function normalizeForSearch(text: string): string {
  return text.toLowerCase().replace(/_/gv, ' ');
}

function scoreParamNames(term: string, parameterNames: string[]): number {
  for (const pName of parameterNames) {
    if (normalizeForSearch(pName).includes(term)) {
      return PARAM_NAME_SCORE;
    }
  }
  return MIN_SCORE;
}

function scoreParamDescriptions(term: string, parameterDescriptions: string[]): number {
  for (const pDesc of parameterDescriptions) {
    if (normalizeForSearch(pDesc).includes(term)) {
      return PARAM_DESC_SCORE;
    }
  }
  return MIN_SCORE;
}

function scoreTermAgainstEntry(term: string, entry: CatalogEntry): number {
  let score = MIN_SCORE;

  if (normalizeForSearch(entry.name).includes(term)) score += NAME_CONTAINS_SCORE;
  if (normalizeForSearch(entry.category).includes(term)) score += CATEGORY_SCORE;
  if (normalizeForSearch(entry.description).includes(term)) score += DESCRIPTION_SCORE;

  score += scoreParamNames(term, entry.parameterNames);
  score += scoreParamDescriptions(term, entry.parameterDescriptions);

  return score;
}

function computeMultiTermScore(normalizedQuery: string, entry: CatalogEntry): number {
  const terms = normalizedQuery.split(/\s+/v).filter((t) => t.length > MIN_SCORE);
  let total = MIN_SCORE;
  for (const term of terms) {
    total += scoreTermAgainstEntry(term, entry);
  }
  return total;
}

function scoreEntry(normalizedQuery: string, entry: CatalogEntry): number {
  const normalizedName = normalizeForSearch(entry.name);
  const multiTermScore = computeMultiTermScore(normalizedQuery, entry);

  if (normalizedName === normalizedQuery) return EXACT_NAME_BONUS + multiTermScore;

  return multiTermScore;
}

function toSearchResult(entry: CatalogEntry): SearchResult {
  return {
    name: entry.name,
    description: entry.description,
    category: entry.category,
  };
}

export function searchTools(catalog: CatalogEntry[], query: string): SearchResult[] {
  if (query.trim().length === MIN_SCORE) return [];

  const normalizedQuery = normalizeForSearch(query);

  return catalog
    .map((entry) => ({ entry, score: scoreEntry(normalizedQuery, entry) }))
    .filter((item) => item.score > MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(MIN_SCORE, MAX_RESULTS)
    .map(({ entry }) => toSearchResult(entry));
}

export function getToolSchemas(catalog: CatalogEntry[], toolNames: string[]): SchemaResult[] {
  const nameSet = new Set(toolNames);
  return catalog
    .filter((entry) => nameSet.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      description: entry.description,
      category: entry.category,
      inputSchema: entry.inputSchema,
    }));
}
