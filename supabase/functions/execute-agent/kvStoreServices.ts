// Re-export shim (RU1 transition). The KvStoreServices implementation now lives
// in @daviddh/shared-store-services so Node, Worker, and Deno share one copy.
// Resolved via a relative path to the built dist (the edge import map does not
// alias the workspace package), mirroring how this dir imports
// @daviddh/llm-graph-runner. Old file deletion happens in RU6.
export { makeKvStoreService } from '../../../packages/shared-store-services/dist/index.js';
