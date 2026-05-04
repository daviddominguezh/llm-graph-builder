import { describe, expect, it } from '@jest/globals';

import { McpError } from '../../transport/errors.js';
import { connectMcp } from '../mcpClient.js';
import { MCP_PROTOCOL_VERSION } from '../types.js';
import { type MockTransport, createMockTransport } from './mockTransport.js';

const FIRST_INDEX = 0;
const SECOND_INDEX = 1;
const ONE = 1;
const THREE = 3;

const VALID_INIT_RESPONSE = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  serverInfo: { name: 'srv', version: '1.0.0' },
  capabilities: { tools: { listChanged: false } },
};

const SAMPLE_TOOL = {
  name: 'echo',
  description: 'echoes input',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
};

function freshTransport(): MockTransport {
  const t = createMockTransport();
  t.responses.set('initialize', VALID_INIT_RESPONSE);
  return t;
}

describe('connectMcp — initialization', () => {
  it('runs initialize handshake and returns a handle', async () => {
    const transport = freshTransport();
    const handle = await connectMcp({ transport });
    expect(handle.initialized.serverInfo.name).toBe('srv');
    expect(transport.requests[FIRST_INDEX]?.method).toBe('initialize');
    expect(transport.notifications[FIRST_INDEX]?.method).toBe('notifications/initialized');
  });

  it('exposes session id from the transport via getter', async () => {
    const transport = freshTransport();
    const handle = await connectMcp({ transport });
    expect(handle.sessionId).toBeNull();
    transport.setSessionId('s-123');
    expect(handle.sessionId).toBe('s-123');
  });

  it('preserves a pre-populated session id across initialize', async () => {
    const transport = freshTransport();
    transport.setSessionId('cached-abc');
    const handle = await connectMcp({ transport });
    expect(handle.sessionId).toBe('cached-abc');
  });
});

describe('connectMcp — listTools', () => {
  it('parses tools array from response', async () => {
    const transport = freshTransport();
    transport.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    const handle = await connectMcp({ transport });
    const tools = await handle.listTools();
    expect(tools).toHaveLength(ONE);
    expect(tools[FIRST_INDEX]?.name).toBe('echo');
  });

  it('throws McpError when response is missing tools array', async () => {
    const transport = freshTransport();
    transport.responses.set('tools/list', { wrong: 'shape' });
    const handle = await connectMcp({ transport });
    await expect(handle.listTools()).rejects.toBeInstanceOf(McpError);
  });
});

describe('connectMcp — callTool', () => {
  it('sends name + arguments and parses result', async () => {
    const transport = freshTransport();
    transport.responses.set('tools/call', { content: [{ type: 'text', text: 'hi' }] });
    const handle = await connectMcp({ transport });
    const result = await handle.callTool('echo', { text: 'hello' });
    expect(result.content).toHaveLength(ONE);
    // initialize is request[0], tools/call is request[1]
    expect(transport.requests[SECOND_INDEX]?.method).toBe('tools/call');
    expect(transport.requests[SECOND_INDEX]?.params).toEqual({
      name: 'echo',
      arguments: { text: 'hello' },
    });
  });

  it('throws McpError when content is not an array', async () => {
    const transport = freshTransport();
    transport.responses.set('tools/call', { content: 'oops' });
    const handle = await connectMcp({ transport });
    await expect(handle.callTool('echo', {})).rejects.toBeInstanceOf(McpError);
  });

  it('passes through structuredContent and isError when present', async () => {
    const transport = freshTransport();
    transport.responses.set('tools/call', {
      content: [],
      isError: true,
      structuredContent: { reason: 'boom' },
    });
    const handle = await connectMcp({ transport });
    const result = await handle.callTool('broken', {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ reason: 'boom' });
  });
});

describe('connectMcp — close', () => {
  it('delegates close to transport', async () => {
    const transport = freshTransport();
    const handle = await connectMcp({ transport });
    await handle.close();
    expect(transport.closed).toBe(true);
  });
});

describe('connectMcp — multiple operations', () => {
  it('does not re-run initialize between calls', async () => {
    const transport = freshTransport();
    transport.responses.set('tools/list', { tools: [SAMPLE_TOOL] });
    transport.responses.set('tools/call', { content: [] });
    const handle = await connectMcp({ transport });
    await handle.listTools();
    await handle.callTool('echo', {});
    expect(transport.requests).toHaveLength(THREE);
    expect(transport.requests[FIRST_INDEX]?.method).toBe('initialize');
    expect(transport.requests[SECOND_INDEX]?.method).toBe('tools/list');
    expect(transport.notifications).toHaveLength(ONE);
  });
});
