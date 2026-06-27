// Re-export shim (RU1 transition). The implementation now lives in
// @daviddh/shared-store-services so Node, Worker, and Deno share one copy.
// Old file deletion happens in RU6.
export { makeKvStoreService } from '@daviddh/shared-store-services';
