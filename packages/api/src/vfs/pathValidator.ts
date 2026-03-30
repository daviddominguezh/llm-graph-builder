import picomatch from 'picomatch';

import { type PathValidationConfig, VFSError, VFSErrorCode } from './types.js';

const HARDCODED_BLOCKED: readonly string[] = ['.git/**', '.git'];
const DEFAULT_BLOCKED: readonly string[] = ['node_modules/**', '.env', '.env.*'];

const RELATIVE_PREFIX = './';
const DOUBLE_SLASH_RE = /\/+/gv;

function stripRelativePrefix(path: string): string {
  if (path.startsWith(RELATIVE_PREFIX)) return path.slice(RELATIVE_PREFIX.length);
  return path;
}

const TRAILING_SLASH_RE = /\/$/v;

function stripTrailingSlash(path: string): string {
  return path.replace(TRAILING_SLASH_RE, '');
}

function normalizePath(path: string): string {
  const withoutPrefix = stripRelativePrefix(path);
  const deduplicated = withoutPrefix.replace(DOUBLE_SLASH_RE, '/');
  return stripTrailingSlash(deduplicated);
}

function throwPathError(code: VFSErrorCode, message: string): never {
  throw new VFSError(code, message);
}

function validateStructure(path: string): string {
  if (path === '') throwPathError(VFSErrorCode.INVALID_PATH, 'Path cannot be empty');
  if (path.startsWith('/')) throwPathError(VFSErrorCode.INVALID_PATH, 'Path must be relative');
  if (path.includes('..')) throwPathError(VFSErrorCode.INVALID_PATH, 'Path traversal not allowed');
  if (path.includes('\0')) throwPathError(VFSErrorCode.INVALID_PATH, 'Path contains null bytes');
  return normalizePath(path);
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => picomatch(p)(path));
}

export function validatePath(path: string, _config?: PathValidationConfig): void {
  const normalized = validateStructure(path);
  if (matchesAny(normalized, HARDCODED_BLOCKED)) {
    throwPathError(VFSErrorCode.PERMISSION_DENIED, `Access to ${normalized} is blocked`);
  }
}

export function validateWritePath(path: string, config?: PathValidationConfig): void {
  validatePath(path, config);
  const normalized = normalizePath(path);
  const blocked = config?.blockedPatterns ?? DEFAULT_BLOCKED;
  if (matchesAny(normalized, blocked)) {
    throwPathError(VFSErrorCode.PERMISSION_DENIED, `Write to ${normalized} is blocked`);
  }
}
