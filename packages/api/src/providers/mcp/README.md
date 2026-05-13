# MCP Provider

This module exposes MCP servers as Providers in the OpenFlow tool registry.
The api package owns the MCP client end-to-end: transport layer (HTTP/SSE/stdio),
JSON-RPC protocol, initialize handshake, tools/list, tools/call.

## Architecture

- `transport/` — Per-protocol transports (HTTP, SSE, stdio) implementing the
  shared `McpTransport` interface. `createTransport(server)` dispatches on
  `server.transport.type`.
- `client/` — High-level client. `connectMcp({ transport })` runs the initialize
  handshake and returns an `McpClientHandle` exposing `listTools()`, `callTool()`,
  `close()`, plus `initialized.serverInfo` and `sessionId` for caching.
- `buildMcpProvider.ts` — Provider factory. Uses `createTransport` + `connectMcp`
  to describe and execute tools. Raw JSON Schema from MCP servers flows directly
  into `OpenFlowTool.inputSchema` without conversion.
- `index.ts` — Public surface for consumers.

## Caching

`buildMcpProvider.describeTools` caches the tools/list result in Redis for 5
minutes (keyed by orgId + SHA-256 of server URL). Stdio transports skip the
cache because they have no URL. Version-keyed caching (using
`initialized.serverInfo.version`) is a follow-up.

## Per-call execute

The `execute` closure on each built tool currently opens a fresh transport per
invocation. The next iteration will reuse a cached MCP session via
`transport.setSessionId(id)` to eliminate the per-call init overhead.
