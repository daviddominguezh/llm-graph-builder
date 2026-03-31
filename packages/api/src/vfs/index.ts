export { VFSErrorCode, VFSError } from './types.js';

export type {
  CachedFile,
  TreeEntry,
  TreeNode,
  RateLimitInfo,
  Edit,
  PathValidationConfig,
  SourceProvider,
  StorageError,
  StorageFileObject,
  StorageBucketApi,
  StorageClient,
  SupabaseQueryBuilder,
  SupabaseVFSClient,
  RedisPipeline,
  RedisClient,
  VFSContextConfig,
  ReadFileResult,
  ListDirectoryResult,
  FindFilesResult,
  SearchTextMatch,
  SearchTextParams,
  SearchTextResult,
  FileMetadataResult,
  FileTreeResult,
  CountLinesResult,
  SymbolMatch,
  SearchSymbolResult,
  CreateFileResult,
  EditFileResult,
  DeleteFileResult,
  RenameFileResult,
} from './types.js';

export { MemoryLayer } from './memoryLayer.js';
export { DirtySetClient } from './dirtySet.js';
export { StorageLayer } from './storageLayer.js';
export { TreeIndex } from './treeIndex.js';
export { SessionTracker } from './sessionTracker.js';
export { validatePath, validateWritePath } from './pathValidator.js';
export { VFSContext } from './vfsContext.js';
export { generateVFSTools, VFS_TOOLS_PREAMBLE, VFSTool } from './tools/index.js';
