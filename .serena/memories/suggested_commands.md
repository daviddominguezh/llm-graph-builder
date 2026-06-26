# Suggested Commands

Run from repo root unless noted.

## Whole-repo
- `npm run check` — runs each package's `check` in order (shared-validation, landing, graph-types, api, backend, web, widget). Per-package `check` = format + lint + typecheck.
- `npm run typecheck` — `tsc -b` (all packages).
- `npm run lint` — `eslint .`
- `npm run format` — prettier write.
- `npm run dev` — concurrently runs backend (with `ENABLE_MOCK_EXECUTE=true`), web, widget.
- `npm run build:api | build:web | build:types | build:shared`
- `npm run test` — `--workspaces --if-present`.

## Per package (`-w packages/<name>`)
- `npm run check -w packages/<name>` — format+lint+typecheck for one package.
- `npm run typecheck -w packages/web` (etc).
- api/web tests need ESM flag (already baked into their `test` script): `npm run test -w packages/api`. Single test: `... -- --testPathPattern=foo`.
- web dev server: port 3101.

## System (Darwin)
Standard BSD userland. Prefer ripgrep `rg` over `grep -r`. `sed -i` requires a backup arg (`sed -i '' ...`) — avoid; use Edit tool.
