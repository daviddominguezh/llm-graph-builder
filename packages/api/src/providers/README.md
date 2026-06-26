# Providers

This directory holds the builtin tool providers exposed to agents at runtime
(KV store, RAG, calendar, forms, lead scoring, composition) plus the MCP
adapter. Each provider lives in its own folder with `descriptors.ts`,
`buildTools.ts`, and an `index.ts` that wires up `Provider` (see
`provider.ts`).

## FE translations are mandatory

Every builtin provider's group, tools, and parameters must have matching
entries in `packages/web/messages/en.json` under the `toolCatalog` namespace.
The keys follow a strict convention:

```
toolCatalog.<providerId>.groupName
toolCatalog.<providerId>.tools.<toolName>.description
toolCatalog.<providerId>.tools.<toolName>.params.<paramName>
```

Names (`<providerId>`, `<toolName>`, `<paramName>`) are code identifiers and
are NOT translated — only descriptions are.

This is enforced by the Jest test at
`packages/web/app/lib/__tests__/toolCatalog.test.ts`. When you add a new
builtin tool or parameter, the test will fail in CI with a precise list of
missing keys until you add them. See the `_about` field at the top of
`toolCatalog` in `en.json` for the full convention reminder.

The LLM-facing descriptions (the strings the agent actually sees) continue to
live next to each provider here — they are what `buildTools()` passes to the
AI SDK. The translations in `en.json` are a separate, user-facing copy used
exclusively by the frontend.
