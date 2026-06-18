'use client';

/**
 * User-facing copy of builtin tool descriptions.
 *
 * The strings the LLM sees live in `packages/api/src/providers/<provider>/`
 * (their descriptors / descriptions modules). The FE shows a *separate* set
 * of strings — translatable, often shorter, sometimes tone-different — under
 * the `toolCatalog` namespace in `messages/en.json`.
 *
 * Convention enforced by the Jest test in
 * `packages/web/app/lib/__tests__/toolCatalog.test.ts`:
 *
 *   toolCatalog.<providerId>.groupName
 *   toolCatalog.<providerId>.tools.<toolName>.description
 *   toolCatalog.<providerId>.tools.<toolName>.params.<paramName>
 *
 * Names (tool names, provider ids, param names) are code identifiers and are
 * NOT translated; only descriptions are.
 *
 * The helpers below look up a key in next-intl and fall back to the BE-provided
 * string when the key is missing. In development, a missing key for a builtin
 * provider also emits a `console.warn` so the next developer notices before CI.
 */
import { useTranslations } from 'next-intl';

type Translator = ReturnType<typeof useTranslations>;

const NAMESPACE = 'toolCatalog';

function hasKey(t: Translator, key: string): boolean {
  // next-intl exposes `has` to probe key presence without throwing.
  const candidate = (t as unknown as { has?: (k: string) => boolean }).has;
  if (typeof candidate === 'function') return candidate.call(t, key);
  try {
    t(key);
    return true;
  } catch {
    return false;
  }
}

function warnMissing(key: string, providerKind: ProviderKind): void {
  if (providerKind !== 'builtin') return;
  if (process.env.NODE_ENV === 'production') return;
  // eslint-disable-next-line no-console -- developer hint for missing translation keys
  console.warn(
    `[toolCatalog] missing translation for key: ${NAMESPACE}.${key}. Falling back to LLM-facing description.`
  );
}

export type ProviderKind = 'builtin' | 'mcp';

export interface ToolCatalogLookup {
  groupName: (providerId: string, fallback: string, kind: ProviderKind) => string;
  toolDescription: (
    providerId: string,
    toolName: string,
    fallback: string | undefined,
    kind: ProviderKind
  ) => string | undefined;
  paramDescription: (
    providerId: string,
    toolName: string,
    paramName: string,
    fallback: string | undefined,
    kind: ProviderKind
  ) => string | undefined;
}

export function useToolCatalog(): ToolCatalogLookup {
  const t = useTranslations(NAMESPACE);
  return {
    groupName: (providerId, fallback, kind) => {
      const key = `${providerId}.groupName`;
      if (hasKey(t, key)) return t(key);
      warnMissing(key, kind);
      return fallback;
    },
    toolDescription: (providerId, toolName, fallback, kind) => {
      const key = `${providerId}.tools.${toolName}.description`;
      if (hasKey(t, key)) return t(key);
      warnMissing(key, kind);
      return fallback;
    },
    paramDescription: (providerId, toolName, paramName, fallback, kind) => {
      const key = `${providerId}.tools.${toolName}.params.${paramName}`;
      if (hasKey(t, key)) return t(key);
      warnMissing(key, kind);
      return fallback;
    },
  };
}
