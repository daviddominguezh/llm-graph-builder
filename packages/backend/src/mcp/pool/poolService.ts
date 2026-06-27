import { createConnectionPool } from './connectionPool.js';

// One MCP connection pool per backend instance. The Map inside is the
// long-lived, process-wide state that survives across requests so warm
// transports are reused. Keepalive + eviction timers are wired by server
// bootstrap (out of scope here); this module only owns the singleton handle.
export const mcpPool = createConnectionPool();
