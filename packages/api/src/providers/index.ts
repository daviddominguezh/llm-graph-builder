import { calendarProvider } from './calendar/index.js';
import { compositionProvider } from './composition/index.js';
import { formsProvider } from './forms/index.js';
import { kvStoreProvider } from './kv_store/index.js';
import { leadScoringProvider } from './lead_scoring/index.js';
import type { Provider } from './provider.js';
import { ragProvider } from './rag/index.js';

export const builtInProviders: ReadonlyMap<string, Provider> = new Map([
  ['kv_store', kvStoreProvider],
  ['rag', ragProvider],
  ['calendar', calendarProvider],
  ['forms', formsProvider],
  ['lead_scoring', leadScoringProvider],
  ['composition', compositionProvider],
]);

export type { Provider, ProviderCtx, ToolDescriptor, OAuthTokenBundle } from './provider.js';
export type {
  OpenFlowTool,
  ToolErrorCode,
  KvStoreServices,
  RagStoreServices,
  KvSearchArgs,
  KvRegexArgs,
  KvSearchTarget,
  RagSearchArgs,
  RagRegexArgs,
  KvPagedResult,
} from './types.js';
export {
  toAiSdkTool,
  toAiSdkToolDict,
  ToolError,
  isKvStoreServices,
  isRagStoreServices,
  namespaceToolName,
  parseNamespacedToolName,
  TOOL_NAMESPACE_SEPARATOR,
} from './types.js';
export {
  composeRegistry,
  type Registry,
  type RegistryBuildResult,
  type ComposeRegistryArgs,
  type ProviderFailure,
  type FailureReason,
  type DescribeAllItem,
} from './registry.js';
