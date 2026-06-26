import { describe, expect, it } from '@jest/globals';

import { initialize } from '../initialize.js';
import { MCP_PROTOCOL_VERSION } from '../types.js';
import { createMockTransport } from './mockTransport.js';

const FIRST_INDEX = 0;
const ZERO = 0;
const ONE = 1;

const VALID_INIT_RESPONSE = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  serverInfo: { name: 'test-server', version: '1.2.3' },
  capabilities: { tools: { listChanged: false } },
  instructions: 'hello',
};

describe('initialize — happy path', () => {
  it('sends initialize request with default clientInfo and protocol version', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', VALID_INIT_RESPONSE);
    await initialize({ transport });
    expect(transport.requests).toHaveLength(ONE);
    expect(transport.requests[FIRST_INDEX]?.method).toBe('initialize');
    expect(transport.requests[FIRST_INDEX]?.params).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      clientInfo: { name: 'openflow', version: '0.0.0' },
    });
  });

  it('returns the parsed InitializeResult', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', VALID_INIT_RESPONSE);
    const result = await initialize({ transport });
    expect(result.serverInfo.name).toBe('test-server');
    expect(result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
    expect(result.instructions).toBe('hello');
  });

  it('sends notifications/initialized after successful response', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', VALID_INIT_RESPONSE);
    await initialize({ transport });
    expect(transport.notifications).toHaveLength(ONE);
    expect(transport.notifications[FIRST_INDEX]?.method).toBe('notifications/initialized');
  });

  it('uses caller-provided clientInfo overrides', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', VALID_INIT_RESPONSE);
    await initialize({ transport, clientInfo: { name: 'custom-client', version: '9.9.9' } });
    expect(transport.requests[FIRST_INDEX]?.params).toMatchObject({
      clientInfo: { name: 'custom-client', version: '9.9.9' },
    });
  });
});

describe('initialize — malformed responses', () => {
  it('throws when serverInfo is missing', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
    await expect(initialize({ transport })).rejects.toThrow(/invalid response/v);
  });

  it('throws when serverInfo.version is missing', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      serverInfo: { name: 'no-version' },
    });
    await expect(initialize({ transport })).rejects.toThrow(/invalid response/v);
  });

  it('throws when capabilities is missing', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 's', version: '1' },
    });
    await expect(initialize({ transport })).rejects.toThrow(/invalid response/v);
  });

  it('does not send notifications/initialized when validation fails', async () => {
    const transport = createMockTransport();
    transport.responses.set('initialize', { protocolVersion: '2024-11-05' });
    await expect(initialize({ transport })).rejects.toThrow();
    expect(transport.notifications).toHaveLength(ZERO);
  });
});
