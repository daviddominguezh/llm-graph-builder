import type { FormsServices } from './forms/buildTools.js';
import type { LeadScoringProviderServices } from './lead_scoring/buildTools.js';
import type { KvStoreServices, RagStoreServices } from './types.js';
import type { WebProviderServices } from './web/types.js';

/**
 * Closed union of provider ids for all built-in providers. The single source of
 * truth that drives the typed services resolver (`ProviderCtx.services<P>`),
 * the typed bundle map (`BuiltinBundles`), and the exhaustive preparer map in
 * the edge function. Adding a new built-in provider means adding its id here
 * AND wiring its bundle type below — both are then enforced by the compiler.
 */
export type BuiltinProviderId =
  | 'kv_store'
  | 'rag'
  | 'forms'
  | 'lead_scoring'
  | 'calendar'
  | 'composition'
  | 'web';

/**
 * Runtime mirror of `BuiltinProviderId`. Used by the backstop test that asserts
 * every id present in `builtInProviders` is also present in this list (catches
 * drift where a provider is added to the registry but forgotten here).
 */
export const BUILTIN_PROVIDER_IDS: readonly BuiltinProviderId[] = [
  'kv_store',
  'rag',
  'forms',
  'lead_scoring',
  'calendar',
  'composition',
  'web',
] as const;

/**
 * Per-provider runtime bundle shape served by `ctx.services(providerId)`.
 *
 * `| undefined` is preserved for bundles that the edge function constructs
 * conditionally today (no conversation id → no forms / lead scoring; no oauth
 * token → no calendar). `composition` does not read `ctx.services` at all, so
 * its bundle is just `undefined`.
 */
export interface BuiltinBundles {
  kv_store: KvStoreServices;
  rag: RagStoreServices;
  forms: FormsServices | undefined;
  lead_scoring: LeadScoringProviderServices | undefined;
  calendar: undefined;
  composition: undefined;
  web: WebProviderServices | undefined;
}
