# Tech Stack

- Node >=18. npm workspaces. TypeScript ~5.8, strict, `noUncheckedIndexedAccess`, ESM (NodeNext).
- ESLint 9 flat config, `eslint-config-love` (strict). Prettier 3 with `@trivago/prettier-plugin-sort-imports`.
- Path aliases: api `@src/*`→`./src/*`; web `@/*`→`./*`.

## Per package
- api: `ai` (Vercel AI SDK v6), `@openrouter/ai-sdk-provider`, `zod` v4, `@upstash/redis`, `picomatch`. Jest (ESM via `--experimental-vm-modules`).
- backend: dedicated server; db, mcp, rag, workers, messaging.
- web: Next 16 (App Router, `--webpack`), React 19, `@xyflow/react` (graph editor), Redux Toolkit + react-redux, SWR, `@supabase/ssr` + supabase-js, react-hook-form + zod, i18next + next-intl + react-i18next, shadcn/ui on `@base-ui/react` (NOT radix — though many `@radix-ui/*` primitives present), tailwind v4, motion, overlayscrollbars. Jest.
- widget: Vite + vitest.
- landing: Next.js.
- graph-types / shared-validation: plain TS libs.
