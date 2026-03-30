// VFS Types — error codes, data shapes, provider interfaces, result types

// ─── Error Handling ───────────────────────────────────────────────────────────

export enum VFSErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_PATH = 'INVALID_PATH',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  BINARY_FILE = 'BINARY_FILE',
  AMBIGUOUS_MATCH = 'AMBIGUOUS_MATCH',
  MATCH_NOT_FOUND = 'MATCH_NOT_FOUND',
  TOO_LARGE = 'TOO_LARGE',
  INVALID_PARAMETER = 'INVALID_PARAMETER',
  RATE_LIMITED = 'RATE_LIMITED',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
}

export class VFSError extends Error {
  code: VFSErrorCode;
  details?: Record<string, unknown>;

  constructor(code: VFSErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'VFSError';
    this.code = code;
    this.details = details;
  }
}

// ─── Data Types ───────────────────────────────────────────────────────────────

export interface CachedFile {
  content: string;
  updatedAt: number;
}

export interface TreeEntry {
  path: string;
  type: 'file' | 'directory';
  sizeBytes?: number;
  sha?: string;
}

export interface TreeNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  sizeBytes?: number;
  language?: string;
  children?: TreeNode[];
}

export interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
  limit: number;
}

export interface Edit {
  old_text: string;
  new_text: string;
}

export interface PathValidationConfig {
  blockedPatterns?: string[];
}

// ─── Source Provider ──────────────────────────────────────────────────────────

export interface SourceProvider {
  readonly commitSha: string;
  rateLimit: RateLimitInfo;
  fetchTree: () => Promise<TreeEntry[]>;
  fetchFileContent: (path: string) => Promise<Uint8Array>;
}

// ─── Generic Storage Client ───────────────────────────────────────────────────

export interface StorageError {
  message: string;
  statusCode?: string;
}

export interface StorageFileObject {
  name: string;
  id: string | null;
}

type StorageResult<T> = Promise<{ data: T | null; error: StorageError | null }>;

export interface StorageBucketApi {
  upload: (
    path: string,
    data: Uint8Array | string,
    options?: Record<string, unknown>
  ) => StorageResult<StorageFileObject>;
  download: (path: string) => StorageResult<Blob>;
  remove: (paths: string[]) => StorageResult<StorageFileObject[]>;
  copy: (fromPath: string, toPath: string) => StorageResult<{ path: string }>;
  list: (prefix?: string, options?: Record<string, unknown>) => StorageResult<StorageFileObject[]>;
}

export interface StorageClient {
  from: (bucket: string) => StorageBucketApi;
}

// ─── Supabase Client ──────────────────────────────────────────────────────────

export interface SupabaseQueryBuilder {
  upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => SupabaseQueryBuilder;
  update: (values: Record<string, unknown>) => SupabaseQueryBuilder;
  delete: () => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  select: (columns?: string) => SupabaseQueryBuilder;
  lt: (column: string, value: unknown) => SupabaseQueryBuilder;
  single: () => SupabaseQueryBuilder;
  then: <TResult>(
    onfulfilled: (value: { data: unknown; error: StorageError | null }) => TResult
  ) => Promise<TResult>;
}

export interface SupabaseVFSClient {
  storage: StorageClient;
  from: (table: string) => SupabaseQueryBuilder;
}

// ─── Redis Client ─────────────────────────────────────────────────────────────

export interface RedisPipeline {
  hset: (key: string, field: string, value: string) => RedisPipeline;
  expire: (key: string, seconds: number) => RedisPipeline;
  exec: () => Promise<unknown[]>;
}

export interface RedisClient {
  hget: (key: string, field: string) => Promise<string | null>;
  hmget: (key: string, ...fields: string[]) => Promise<Array<string | null>>;
  hset: (key: string, field: string, value: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  del: (key: string) => Promise<number>;
  pipeline: () => RedisPipeline;
}

// ─── VFS Context Config ───────────────────────────────────────────────────────

export interface VFSContextConfig {
  tenantSlug: string;
  agentSlug: string;
  userID: string;
  sessionId: string;
  commitSha: string;
  sourceProvider: SourceProvider;
  supabase: SupabaseVFSClient;
  redis: RedisClient;
  protectedPaths?: string[];
  searchCandidateLimit?: number; // default 200
  searchConcurrency?: number; // default 10
  readLineCeiling?: number; // default 10000
  rateLimitThreshold?: number; // default 100
}

// ─── Result Types ─────────────────────────────────────────────────────────────

export interface ReadFileResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  tokenEstimate: number;
}

export interface ListDirectoryResult {
  path: string;
  entries: Array<{ name: string; type: 'file' | 'directory' }>;
}

export interface FindFilesResult {
  pattern: string;
  matches: string[];
  totalMatches: number;
  truncated: boolean;
}

export interface SearchTextMatch {
  path: string;
  line: number;
  column: number;
  content: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface SearchTextParams {
  pattern: string;
  isRegex?: boolean;
  path?: string;
  includeGlob?: string;
  ignoreCase?: boolean;
  maxResults?: number;
}

export interface SearchTextResult {
  pattern: string;
  matches: SearchTextMatch[];
  totalMatches: number;
  truncated: boolean;
}

export interface FileMetadataResult {
  path: string;
  sizeBytes: number | undefined;
  lineCount: number | null;
  language: string;
  isBinary: boolean;
}

export interface FileTreeResult {
  path: string;
  tree: TreeNode;
  truncated: boolean;
}

export interface CountLinesResult {
  path: string;
  totalLines: number;
  matchingLines?: number;
  pattern?: string;
}

export interface SymbolMatch {
  path: string;
  line: number;
  kind: string;
  signature: string;
}

export interface SearchSymbolResult {
  name: string;
  matches: SymbolMatch[];
}

export interface CreateFileResult {
  path: string;
  linesWritten: number;
}

export interface EditFileResult {
  path: string;
  editsApplied: number;
  newLineCount: number;
}

export interface DeleteFileResult {
  path: string;
  deleted: boolean;
}

export interface RenameFileResult {
  oldPath: string;
  newPath: string;
}
