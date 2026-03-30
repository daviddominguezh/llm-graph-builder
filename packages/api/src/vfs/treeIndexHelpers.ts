// treeIndexHelpers.ts — constants and pure helpers for TreeIndex
import type { TreeEntry, TreeNode } from './types.js';

// ─── Ignore List ──────────────────────────────────────────────────────────────

export const DEFAULT_IGNORES: readonly string[] = [
  '.git',
  'node_modules',
  '__pycache__',
  '.next',
  'dist',
  'build',
];

// ─── Language Map ─────────────────────────────────────────────────────────────

export const LANGUAGE_MAP: Readonly<Record<string, string>> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  cpp: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  swift: 'swift',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  mdx: 'markdown',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
};

// ─── Path Helpers ─────────────────────────────────────────────────────────────

const DOT_NOT_FOUND = -1;
const AFTER_DOT = 1;

export function inferLanguage(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot === DOT_NOT_FOUND) return 'unknown';
  const ext = path.slice(dot + AFTER_DOT).toLowerCase();
  return LANGUAGE_MAP[ext] ?? 'unknown';
}

const FIRST_SEGMENT_INDEX = 0;

export function shouldIgnore(path: string): boolean {
  const firstSegment = path.split('/')[FIRST_SEGMENT_INDEX] ?? '';
  return DEFAULT_IGNORES.includes(firstSegment);
}

// ─── Nested Tree Builder ──────────────────────────────────────────────────────

const DEPTH_ONE = 1;
const SEPARATOR = '/';

function isDirectChild(entryPath: string, rootPath: string): boolean {
  if (rootPath === '') {
    return !entryPath.includes(SEPARATOR);
  }
  if (!entryPath.startsWith(`${rootPath}${SEPARATOR}`)) return false;
  const remainder = entryPath.slice(rootPath.length + DEPTH_ONE);
  return !remainder.includes(SEPARATOR);
}

const LAST_ELEMENT = -1;

function makeTreeNode(entry: TreeEntry, language?: string): TreeNode {
  return {
    name: entry.path.split(SEPARATOR).at(LAST_ELEMENT) ?? entry.path,
    type: entry.type,
    path: entry.path,
    sizeBytes: entry.sizeBytes,
    language,
    children: entry.type === 'directory' ? [] : undefined,
  };
}

function collectDirectChildren(
  entries: Map<string, TreeEntry>,
  rootPath: string,
  maxDepth: number
): TreeNode[] {
  const nodes: TreeNode[] = [];

  for (const entry of entries.values()) {
    if (entry.path === rootPath) continue;
    if (!isDirectChild(entry.path, rootPath)) continue;

    const language = entry.type === 'file' ? inferLanguage(entry.path) : undefined;
    const node = makeTreeNode(entry, language);

    if (entry.type === 'directory') {
      node.children = buildChildrenList(entries, entry.path, maxDepth - DEPTH_ONE);
    }

    nodes.push(node);
  }

  return nodes;
}

const DIRECTORY_SORT_WEIGHT = -1;
const FILE_SORT_WEIGHT = 1;

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? DIRECTORY_SORT_WEIGHT : FILE_SORT_WEIGHT;
    return a.name.localeCompare(b.name);
  });
}

const EMPTY_DEPTH = 0;

function buildChildrenList(
  entries: Map<string, TreeEntry>,
  rootPath: string,
  maxDepth: number
): TreeNode[] {
  if (maxDepth <= EMPTY_DEPTH) return [];
  const children = collectDirectChildren(entries, rootPath, maxDepth);
  return sortNodes(children);
}

export function buildNestedTree(
  entries: Map<string, TreeEntry>,
  rootPath: string,
  maxDepth: number
): TreeNode {
  const rootEntry = entries.get(rootPath);
  const name = rootPath === '' ? '' : (rootPath.split(SEPARATOR).at(LAST_ELEMENT) ?? rootPath);
  const root: TreeNode = {
    name,
    type: rootEntry?.type ?? 'directory',
    path: rootPath,
    children: [],
  };

  root.children = buildChildrenList(entries, rootPath, maxDepth);
  return root;
}
