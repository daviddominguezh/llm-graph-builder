# Conventions

## Hard rules (user-enforced, do not violate)
- Never `eslint-disable` (no comments, no config edits).
- Never use `any` — explicit types only.
- Always add translations for user-facing text (i18next/next-intl).
- Never use `!important` in CSS/Tailwind.
- For `max-lines` (300/file) / `max-lines-per-function` (40) / `max-depth` (2): refactor by extracting named helpers / splitting files — NEVER compress statements onto one line.

## Formatting
Single quotes, 2-space indent, print width 110, trailing comma es5. Imports auto-sorted by trivago plugin.

## Git (user preferences)
- Never `git stash`, never reset/discard changes, never `git commit -a/-am` (stage explicitly). User runs parallel work — don't sweep unrelated changes.
- Migration files only; user applies DB migrations/resets (never apply yourself).

## UI / web specifics → `mem:web/core`
## Data-access invariant → `mem:core`
