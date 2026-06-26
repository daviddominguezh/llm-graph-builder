import type { BuiltinProvider } from '../provider.js';
import { buildCompositionTools } from './buildTools.js';
import { COMPOSITION_DESCRIPTORS } from './descriptors.js';

/**
 * `finish` is emitted at runtime when `ctx.isChildAgent` is true, but does NOT
 * appear in the descriptors (it is implicit, not user-selectable). We still
 * declare it in `toolNames` because the build-side return tuple is the source
 * of truth for the typed `BuiltinProvider`; the runtime backstop test
 * tolerates this difference by allowing extra names in `toolNames` that are
 * not selectable.
 */
const TOOL_NAMES = ['create_agent', 'invoke_agent', 'invoke_workflow', 'finish'] as const;

export const compositionProvider: BuiltinProvider<'composition', typeof TOOL_NAMES> = {
  type: 'builtin',
  id: 'composition',
  displayName: 'OpenFlow/Composition',
  description: 'Dispatch sub-agents, invoke other agents/workflows.',
  toolNames: TOOL_NAMES,
  describeTools: async () => await Promise.resolve(COMPOSITION_DESCRIPTORS),
  buildTools: buildCompositionTools,
};
