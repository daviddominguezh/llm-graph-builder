import { calendarProvider } from './calendar/index.js';
import { compositionProvider } from './composition/index.js';
import { formsProvider } from './forms/index.js';
import { leadScoringProvider } from './lead_scoring/index.js';
import type { Provider } from './provider.js';

export const builtInProviders: ReadonlyMap<string, Provider> = new Map([
  ['calendar', calendarProvider],
  ['forms', formsProvider],
  ['lead_scoring', leadScoringProvider],
  ['composition', compositionProvider],
]);

export type { Provider, ProviderCtx, ToolDescriptor, OAuthTokenBundle } from './provider.js';
export type { OpenFlowTool } from './types.js';
export { toAiSdkTool, toAiSdkToolDict } from './types.js';
export {
  composeRegistry,
  type Registry,
  type RegistryBuildResult,
  type ComposeRegistryArgs,
  type ProviderFailure,
  type FailureReason,
  type DescribeAllItem,
} from './registry.js';
export type { McpClient, McpConnector } from './mcp/types.js';
export { MockMcpConnector } from './mcp/MockMcpConnector.js';
// NOTE: testConnectorConformance is intentionally NOT re-exported here.
// It imports `@jest/globals` at the top, which would pull jest into the
// production runtime. Test files import it directly via the deep path
// `@daviddh/llm-graph-runner/dist/providers/mcp/conformance.js`.
