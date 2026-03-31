// vfsContext.ts — coordinator that orchestrates all VFS layers
import { DirtySetClient } from './dirtySet.js';
import { MemoryLayer } from './memoryLayer.js';
import { validatePath, validateWritePath } from './pathValidator.js';
import { SessionTracker } from './sessionTracker.js';
import { StorageLayer } from './storageLayer.js';
import { TreeIndex } from './treeIndex.js';
import type {
  CountLinesResult,
  CreateFileResult,
  DeleteFileResult,
  Edit,
  EditFileResult,
  FileMetadataResult,
  FileTreeResult,
  FindFilesResult,
  ListDirectoryResult,
  PathValidationConfig,
  ReadFileResult,
  RenameFileResult,
  SearchSymbolResult,
  SearchTextParams,
  SearchTextResult,
  VFSContextConfig,
} from './types.js';
import type { ReadDeps } from './vfsContextRead.js';
import {
  buildCountLinesResult,
  buildReadResult,
  enforceLineCeiling,
  findFilesFromTree,
  getFileMetadataFromTree,
  getFileTreeFromIndex,
  listDirectoryFromTree,
  resolveFileContent,
  searchTextInFiles,
} from './vfsContextRead.js';
import { ensureTreeFresh } from './vfsContextTree.js';
import { createFileOp, deleteFileOp, editFileOp, renameFileOp } from './vfsContextWrite.js';

const DEFAULT_CANDIDATE_LIMIT = 200;
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_LINE_CEILING = 10000;
const DEFAULT_RATE_LIMIT_THRESHOLD = 100;

function buildSessionKey(config: VFSContextConfig): string {
  return `${config.tenantSlug}/${config.agentSlug}/${config.userID}/${config.sessionId}`;
}

export class VFSContext {
  private readonly config: VFSContextConfig;
  private readonly sessionKey: string;
  private readonly memoryLayer: MemoryLayer;
  private readonly storageLayer: StorageLayer;
  private readonly dirtySet: DirtySetClient;
  private readonly sessionTracker: SessionTracker;
  private readonly validationConfig: PathValidationConfig;
  private treeIndex: TreeIndex;

  constructor(config: VFSContextConfig) {
    this.config = config;
    this.sessionKey = buildSessionKey(config);
    this.memoryLayer = new MemoryLayer();
    this.storageLayer = new StorageLayer(config.supabase, this.sessionKey);
    this.dirtySet = new DirtySetClient(config.redis, this.sessionKey);
    this.sessionTracker = new SessionTracker(config.supabase, this.sessionKey);
    this.treeIndex = new TreeIndex();
    this.validationConfig = { blockedPatterns: config.protectedPaths };
  }

  async initialize(): Promise<void> {
    await this.sessionTracker.initialize({
      tenantSlug: this.config.tenantSlug,
      agentSlug: this.config.agentSlug,
      userID: this.config.userID,
      sessionId: this.config.sessionId,
      commitSha: this.config.commitSha,
    });
  }

  private get deps(): ReadDeps {
    return {
      memoryLayer: this.memoryLayer,
      storageLayer: this.storageLayer,
      dirtySet: this.dirtySet,
      sourceProvider: this.config.sourceProvider,
      treeIndex: this.treeIndex,
      rateLimitThreshold: this.config.rateLimitThreshold ?? DEFAULT_RATE_LIMIT_THRESHOLD,
    };
  }

  private async freshTree(): Promise<void> {
    this.treeIndex = await ensureTreeFresh(this.treeIndex, this.deps);
  }

  async readFile(path: string, start?: number, end?: number): Promise<ReadFileResult> {
    validatePath(path);
    await this.sessionTracker.touch();
    await this.freshTree();
    const content = await resolveFileContent(this.deps, path);
    enforceLineCeiling(content, path, this.config.readLineCeiling ?? DEFAULT_LINE_CEILING);
    return buildReadResult(path, content, start, end);
  }

  async createFile(path: string, content: string): Promise<CreateFileResult> {
    validateWritePath(path, this.validationConfig);
    await this.sessionTracker.touch();
    await this.freshTree();
    return await createFileOp(this.deps, path, content);
  }

  async editFile(path: string, edits?: Edit[], fullContent?: string): Promise<EditFileResult> {
    validateWritePath(path, this.validationConfig);
    await this.sessionTracker.touch();
    await this.freshTree();
    return await editFileOp(this.deps, path, edits, fullContent);
  }

  async deleteFile(path: string): Promise<DeleteFileResult> {
    validateWritePath(path, this.validationConfig);
    await this.sessionTracker.touch();
    await this.freshTree();
    return await deleteFileOp(this.deps, path);
  }

  async renameFile(oldPath: string, newPath: string): Promise<RenameFileResult> {
    validateWritePath(oldPath, this.validationConfig);
    validateWritePath(newPath, this.validationConfig);
    await this.sessionTracker.touch();
    await this.freshTree();
    return await renameFileOp(this.deps, oldPath, newPath);
  }

  async listDirectory(path: string, recursive?: boolean, maxDepth?: number): Promise<ListDirectoryResult> {
    validatePath(path);
    await this.freshTree();
    return listDirectoryFromTree(this.treeIndex, path, recursive, maxDepth);
  }

  async findFiles(
    pattern: string,
    path?: string,
    exclude?: string[],
    maxResults?: number
  ): Promise<FindFilesResult> {
    await this.freshTree();
    return findFilesFromTree(this.treeIndex, pattern, path, exclude, maxResults);
  }

  async getFileMetadata(path: string): Promise<FileMetadataResult> {
    validatePath(path);
    await this.freshTree();
    return getFileMetadataFromTree(this.treeIndex, this.memoryLayer, path);
  }

  async getFileTree(path?: string): Promise<FileTreeResult> {
    await this.freshTree();
    return getFileTreeFromIndex(this.treeIndex, path ?? '');
  }

  async countLines(path: string, pattern?: string, isRegex?: boolean): Promise<CountLinesResult> {
    validatePath(path);
    await this.sessionTracker.touch();
    await this.freshTree();
    const content = await resolveFileContent(this.deps, path);
    return buildCountLinesResult(path, content, pattern, isRegex);
  }

  // Placeholder — symbol search is not implemented in this task
  searchSymbol(name: string): SearchSymbolResult {
    void this.treeIndex; // reference this so ESLint sees usage
    return { name, matches: [] };
  }

  async searchText(params: SearchTextParams): Promise<SearchTextResult> {
    await this.freshTree();
    const candidateLimit = this.config.searchCandidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
    const concurrency = this.config.searchConcurrency ?? DEFAULT_CONCURRENCY;
    return await searchTextInFiles(this.deps, params, candidateLimit, concurrency);
  }
}
