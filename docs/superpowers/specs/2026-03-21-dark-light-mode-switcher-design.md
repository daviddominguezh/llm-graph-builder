# Dark/Light Mode Switcher — Design Spec

## Overview

Add a dark/light mode switcher that defaults to the user's system preference, persists to localStorage, and loads without flicker. The switcher appears in two locations: the settings page and the canvas toolbar's file menu.

## Approach

Use `next-themes` (already installed, v0.4.6) with `attribute="class"` to toggle the `.dark` class on `<html>`. The existing CSS custom properties in `globals.css` already define both light and dark color schemes via the `.dark` selector — no CSS changes needed.

## Components

### 1. ThemeProvider wrapper

**File:** `packages/web/app/components/ThemeProvider.tsx`

A thin `'use client'` wrapper around `next-themes`'s `ThemeProvider`:

- `attribute="class"` — toggles `.dark` class on `<html>`
- `defaultTheme="system"` — respects OS preference on first visit
- `storageKey="theme"` — persists in localStorage
- `disableTransitionOnChange` — prevents flash of transition during theme switch

### 2. Root layout changes

**File:** `packages/web/app/layout.tsx`

- Add `suppressHydrationWarning` to `<html>` (required by next-themes to avoid hydration mismatch from its injected blocking script)
- Wrap **all** children inside `NextIntlClientProvider` with the `ThemeProvider` — this includes `{children}`, `<Toaster />`, and `<OpenRouterModelsLogger />`, so everything that calls `useTheme()` has access to the provider

### 3. ThemeSwitcher component

**File:** `packages/web/app/components/ThemeSwitcher.tsx`

A reusable segmented control with two icon buttons:

- **Icons:** `Sun` (light) and `Moon` (dark) from `lucide-react`
- **Layout:** Two buttons side by side in a rounded container, the active one gets a highlighted background (`bg-muted`)
- **Logic:** Uses `useTheme()` from `next-themes`. Reads `resolvedTheme` (which resolves "system" to actual light/dark) to determine which icon is active. Clicking sets the theme to the explicit value ("light" or "dark").
- **No labels** — icons only
- **Accessibility** — each button gets `aria-label` from translation keys (`theme.light` / `theme.dark`)
- **Mounted guard** — only renders after mount to avoid hydration mismatch (standard next-themes pattern)
- **No "system" option** — intentional. The system preference is the default on first visit. Once the user picks light or dark, they've made an explicit choice. There is no "reset to system" UI.

### 4. Settings page integration

**File:** `packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx`

New `AppearanceSection` client component placed above `ApiKeysSection`:

- Card with title using translation key `theme.appearance`
- Contains the `ThemeSwitcher` component
- Follows existing card/section patterns in the settings page

### 5. Toolbar / FileMenu integration

**File:** `packages/web/app/components/panels/Toolbar.tsx`

Inside the `FileMenu` dropdown content, below the auto-layout item:

- A `Separator`
- The `ThemeSwitcher` component rendered inline within the dropdown
- Styled with appropriate padding to match dropdown menu item spacing

### 6. Translations

**File:** `packages/web/messages/en.json`

New `"theme"` namespace:

```json
{
  "theme": {
    "appearance": "Appearance",
    "light": "Light",
    "dark": "Dark"
  }
}
```

## Files to create

| File | Purpose |
|------|---------|
| `packages/web/app/components/ThemeProvider.tsx` | Client wrapper for next-themes |
| `packages/web/app/components/ThemeSwitcher.tsx` | Reusable segmented icon toggle |
| `packages/web/app/components/orgs/AppearanceSection.tsx` | Settings section with theme switcher |

## Files to modify

| File | Change |
|------|--------|
| `packages/web/app/layout.tsx` | Add `suppressHydrationWarning`, wrap in ThemeProvider |
| `packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx` | Add AppearanceSection above ApiKeysSection |
| `packages/web/app/components/panels/Toolbar.tsx` | Add ThemeSwitcher in FileMenu dropdown |
| `packages/web/messages/en.json` | Add `theme` namespace |
| `packages/web/app/components/GraphCanvas.tsx` | Pass `colorMode` prop to `<ReactFlow>` from `useTheme()` |

## React Flow dark mode

The `<ReactFlow>` component supports a `colorMode` prop (`"light" | "dark" | "system"`). Without it, the canvas background pattern and built-in controls stay light-themed. `GraphCanvas.tsx` must pass `colorMode` derived from `resolvedTheme` via `useTheme()`. The existing `.react-flow.dark` CSS block in `globals.css` will then activate automatically.

## Hardcoded light-mode colors (follow-up)

Several components use hardcoded colors like `bg-white`, `text-black`, `bg-gray-100`, etc. These will look wrong in dark mode. Fixing these is scoped as a **separate follow-up task** after the core theme infrastructure is in place, since it touches 30+ instances across many files and is independent of the switcher mechanism itself.

## No-flicker strategy

`next-themes` injects a blocking `<script>` into `<head>` that runs before React hydrates. This script reads localStorage and sets the `.dark` class on `<html>` immediately, so the correct theme is applied before the first paint. The `suppressHydrationWarning` on `<html>` prevents React from warning about the server/client class mismatch.

## What's NOT changing

- `globals.css` — light/dark CSS variables are already complete
- shadcn components — already support dark mode via CSS variables and `dark:` prefixes
- `components/ui/sonner.tsx` — already uses `useTheme()`, will work once the provider is added
