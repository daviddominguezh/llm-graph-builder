import { describe, expect, it, jest } from '@jest/globals';

import { buildAgentToolsAtStart } from '../../core/buildAgentToolsAtStart.js';
import { buildMcpProvider } from '../../providers/mcp/buildMcpProvider.js';
import { createMockTransport } from '../../providers/mcp/client/__tests__/mockTransport.js';
import { MCP_PROTOCOL_VERSION } from '../../providers/mcp/client/types.js';
import type { ProviderCtx } from '../../providers/provider.js';
import type { Registry, RegistryBuildResult } from '../../providers/registry.js';
import { type OpenFlowTool, namespaceToolName } from '../../providers/types.js';
import type { SelectedTool } from '../../types/selectedTool.js';
import type { Logger } from '../../utils/logger.js';
import type { AgentLoopConfig, SkillDefinition } from '../agentLoopTypes.js';
import { buildSystemMessage } from '../agentLoopHelpers.js';
import { buildSkillTool } from '../skillTool.js';

const SKILL_TOOL_NAME = 'get_skill_content';
const SKILLS_HEADER = '## Available Skills';

const SKILL: SkillDefinition = { name: 'refund', description: 'Refund flow', content: 'do X' };

const BASE_CFG: AgentLoopConfig = {
  systemPrompt: 'sys',
  context: '',
  messages: [],
  apiKey: 'k',
  modelId: 'm',
  maxSteps: null,
  tools: {},
};

// buildSystemMessage always produces a string `content`; narrow it for assertions.
function systemContent(config: AgentLoopConfig): string {
  const { content } = buildSystemMessage(config);
  if (typeof content !== 'string') throw new Error('expected system message content to be a string');
  return content;
}

describe('skills payoff', () => {
  it('non-empty skills add the get_skill_content tool', () => {
    expect(Object.keys(buildSkillTool([SKILL]))).toContain(SKILL_TOOL_NAME);
  });

  it('non-empty skills add the "## Available Skills" prompt section', () => {
    const content = systemContent({ ...BASE_CFG, skills: [SKILL] });
    expect(content).toContain(SKILLS_HEADER);
    expect(content).toContain(SKILL.name);
  });

  it('empty skills do NOT pollute the prompt with a header', () => {
    const content = systemContent({ ...BASE_CFG, skills: [] });
    expect(content).not.toContain(SKILLS_HEADER);
  });
});

const MCP_PROVIDER_ID = 'mcp-1';
const MCP_TOOL_NAME = 'create_deal';

const MCP_REF: SelectedTool = {
  providerType: 'mcp',
  providerId: MCP_PROVIDER_ID,
  toolName: MCP_TOOL_NAME,
};

const VALID_INIT_RESPONSE = {
  protocolVersion: MCP_PROTOCOL_VERSION,
  serverInfo: { name: 'srv', version: '1.0.0' },
  capabilities: { tools: { listChanged: false } },
};

const SAMPLE_MCP_TOOL = {
  name: MCP_TOOL_NAME,
  description: 'Create a deal',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
};

function makeLogger(): Logger {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    help: jest.fn(),
    data: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    prompt: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    input: jest.fn(),
    silly: jest.fn(),
  };
}

function makeCtx(): ProviderCtx {
  return {
    orgId: 'o',
    tenantId: 'test-tenant-id',
    agentId: 'a',
    isChildAgent: false,
    logger: makeLogger(),
    oauthTokens: new Map(),
    mcpServers: new Map(),
    services: () => undefined,
  };
}

const EMPTY_BUILD_RESULT: RegistryBuildResult = { tools: {}, staleRefs: [], failedProviders: [] };

// A real MCP provider backed by a mock transport, so the tool produced is genuine
// (its `execute` closure is the real MCP call path) rather than a hand-stubbed object.
async function buildRealMcpTool(): Promise<OpenFlowTool> {
  const transport = createMockTransport();
  transport.responses.set('initialize', VALID_INIT_RESPONSE);
  transport.responses.set('tools/list', { tools: [SAMPLE_MCP_TOOL] });
  const provider = buildMcpProvider(
    { id: MCP_PROVIDER_ID, name: 'fake', transport: { type: 'stdio', command: 'echo' }, enabled: true },
    { createTransport: async () => await Promise.resolve(transport) }
  );
  const tools = await provider.buildTools({ toolNames: [MCP_TOOL_NAME], ctx: makeCtx() });
  const { [MCP_TOOL_NAME]: tool } = tools;
  if (tool === undefined) throw new Error('mock MCP provider did not produce the expected tool');
  return tool;
}

// Mirrors buildAgentToolsAtStart.test.ts: a Registry whose buildSelected routes the
// MCP ref to the genuine MCP tool (namespaced) and returns empty otherwise.
function makeMcpRegistry(mcpTool: OpenFlowTool): Registry {
  return {
    providers: [],
    buildSelected: async ({ refs }) => {
      const hasMcpRef = refs.some((r) => r.providerType === 'mcp' && r.providerId === MCP_PROVIDER_ID);
      if (!hasMcpRef) return await Promise.resolve(EMPTY_BUILD_RESULT);
      return await Promise.resolve({
        tools: { [namespaceToolName(MCP_PROVIDER_ID, MCP_TOOL_NAME)]: mcpTool },
        staleRefs: [],
        failedProviders: [],
      });
    },
    findToolByName: async () => await Promise.resolve(null),
    describeAll: async () => await Promise.resolve([]),
  };
}

describe('mcp tool callable payoff', () => {
  it('an mcp selected-tool ref produces a present, callable tool', async () => {
    const mcpTool = await buildRealMcpTool();
    const registry = makeMcpRegistry(mcpTool);
    const result = await buildAgentToolsAtStart(registry, makeCtx(), [MCP_REF]);
    const namespaced = namespaceToolName(MCP_PROVIDER_ID, MCP_TOOL_NAME);
    expect(result.tools[namespaced]).toBeDefined();
    expect(typeof result.tools[namespaced]?.execute).toBe('function');
  });

  it('no selected tools produces no tools', async () => {
    const mcpTool = await buildRealMcpTool();
    const registry = makeMcpRegistry(mcpTool);
    const result = await buildAgentToolsAtStart(registry, makeCtx(), []);
    expect(result.tools).toEqual({});
  });
});
