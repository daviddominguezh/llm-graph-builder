# Dark/Light Mode Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark/light mode switcher using `next-themes` that defaults to system preference, persists to localStorage, and renders without flicker.

**Architecture:** Wrap the app in `next-themes` ThemeProvider (already installed). Create a reusable `ThemeSwitcher` segmented control component. Place it in two locations: settings page and canvas file menu.

**Tech Stack:** next-themes v0.4.6, Next.js 16 App Router, Tailwind CSS v4, shadcn/ui, lucide-react, next-intl

---

### Task 1: Add translations

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1: Add theme namespace to en.json**

Add a `"theme"` key after the last entry (`"toolTest"`) in `messages/en.json`:

```json
"theme": {
  "appearance": "Appearance",
  "light": "Light",
  "dark": "Dark"
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/web/messages/en.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/web/messages/en.json
git commit -m "feat: add theme translations"
```

---

### Task 2: Create ThemeProvider wrapper

**Files:**
- Create: `packages/web/app/components/ThemeProvider.tsx`
- Modify: `packages/web/app/layout.tsx`

- [ ] **Step 1: Create ThemeProvider client component**

Create `packages/web/app/components/ThemeProvider.tsx`:

```tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" storageKey="theme" disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Integrate ThemeProvider in root layout**

In `packages/web/app/layout.tsx`:
- Add `suppressHydrationWarning` to the `<html>` element
- Import `ThemeProvider` from `./components/ThemeProvider`
- Wrap everything inside `<NextIntlClientProvider>` with `<ThemeProvider>` (this includes `{children}`, `<Toaster />`, and `<OpenRouterModelsLogger />`)

The layout should become:

```tsx
<html lang={locale} className={inter.variable} suppressHydrationWarning>
  <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
    <NextIntlClientProvider messages={messages}>
      <ThemeProvider>
        <OpenRouterModelsLogger />
        {children}
        <Toaster />
      </ThemeProvider>
    </NextIntlClientProvider>
  </body>
</html>
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/ThemeProvider.tsx packages/web/app/layout.tsx
git commit -m "feat: add ThemeProvider wrapper to root layout"
```

---

### Task 3: Create ThemeSwitcher component

**Files:**
- Create: `packages/web/app/components/ThemeSwitcher.tsx`

- [ ] **Step 1: Create the ThemeSwitcher component**

Create `packages/web/app/components/ThemeSwitcher.tsx`:

```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function ThemeSwitcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isLight = resolvedTheme === 'light';

  return (
    <div className="inline-flex items-center rounded-md border bg-muted p-0.5 gap-0.5">
      <button
        type="button"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
          isLight ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setTheme('light')}
        aria-label={t('light')}
      >
        <Sun className="size-4" />
      </button>
      <button
        type="button"
        className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
          !isLight ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setTheme('dark')}
        aria-label={t('dark')}
      >
        <Moon className="size-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/ThemeSwitcher.tsx
git commit -m "feat: add ThemeSwitcher segmented control component"
```

---

### Task 4: Add AppearanceSection to settings page

**Files:**
- Create: `packages/web/app/components/orgs/AppearanceSection.tsx`
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create AppearanceSection component**

Create `packages/web/app/components/orgs/AppearanceSection.tsx`:

A `'use client'` component that:
- Uses `useTranslations('theme')` for the title
- Renders a `Card` with `CardHeader` containing `CardTitle` with `t('appearance')`
- `CardContent` contains the `ThemeSwitcher` component
- Follows the same pattern as `ApiKeysSection` (Card + CardHeader + CardContent)

```tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

import { ThemeSwitcher } from '../ThemeSwitcher';

export function AppearanceSection() {
  const t = useTranslations('theme');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('appearance')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ThemeSwitcher />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add AppearanceSection to settings page**

In `packages/web/app/orgs/[slug]/(dashboard)/settings/page.tsx`:
- Import `AppearanceSection` from `@/app/components/orgs/AppearanceSection`
- Place `<AppearanceSection />` between `<OrgSettingsForm>` and `<ApiKeysSection>` in the JSX

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/app/components/orgs/AppearanceSection.tsx packages/web/app/orgs/\[slug\]/\(dashboard\)/settings/page.tsx
git commit -m "feat: add appearance section to settings page"
```

---

### Task 5: Add ThemeSwitcher to FileMenu in Toolbar

**Files:**
- Modify: `packages/web/app/components/panels/Toolbar.tsx`

- [ ] **Step 1: Extract FileMenuItems and add ThemeSwitcher**

The `FileMenu` function is already at the 40-line limit. To stay within bounds, extract a `FileMenuItems` helper and add the theme switcher there.

In `packages/web/app/components/panels/Toolbar.tsx`:
- Import `ThemeSwitcher` from `../ThemeSwitcher`
- Extract a new `FileMenuItems` component that contains the dropdown menu items and the theme switcher:

```tsx
interface FileMenuItemsProps {
  onImport: () => void;
  onExport: () => void;
  onFormat: () => void;
}

function FileMenuItems({ onImport, onExport, onFormat }: FileMenuItemsProps) {
  const t = useTranslations('common');
  const tToolbar = useTranslations('toolbar');

  return (
    <>
      <div className="py-1">
        <DropdownMenuItem onClick={onImport}>
          <Upload className="size-4" />
          {t('import')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="size-4" />
          {t('export')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFormat}>
          <AlignHorizontalSpaceAround className="size-4" />
          {tToolbar('autoLayout')}
        </DropdownMenuItem>
      </div>
      <Separator />
      <div className="px-2 py-1.5">
        <ThemeSwitcher />
      </div>
    </>
  );
}
```

Then update `FileMenu` to use `<FileMenuItems>` instead of inlining the menu items, and remove the now-duplicated `useTranslations` calls from `FileMenu`.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/panels/Toolbar.tsx
git commit -m "feat: add theme switcher to canvas toolbar file menu"
```

---

### Task 6: Pass colorMode to ReactFlow

**Files:**
- Modify: `packages/web/app/components/GraphCanvas.tsx`

- [ ] **Step 1: Add colorMode prop to ReactFlow**

In `packages/web/app/components/GraphCanvas.tsx`:
- Add new import: `import { useTheme } from 'next-themes';`
- Add new import: `import { useEffect, useState } from 'react';` (neither `useState` nor `useEffect` are currently imported in this file)
- In the `GraphCanvas` component body, add a mounted guard and theme resolution before the return:

```tsx
const { resolvedTheme } = useTheme();
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
const colorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';
```

- Pass `colorMode={colorMode}` to the `<ReactFlow>` component

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck -w packages/web`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/GraphCanvas.tsx
git commit -m "feat: pass colorMode to ReactFlow for canvas dark mode"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full check**

Run: `npm run check`
Expected: format, lint, and typecheck all pass

- [ ] **Step 2: Fix any issues**

If any check fails, fix the issues and re-run.

- [ ] **Step 3: Manual verification**

Run: `npm run dev -w packages/web`

Verify:
1. On first load, theme matches OS preference
2. Opening settings page shows Appearance section above API keys with the segmented switcher
3. Opening the file menu in the canvas shows the switcher below auto-layout
4. Clicking Sun/Moon toggles the theme everywhere (including canvas background)
5. Refreshing the page keeps the selected theme (no flicker)
6. Toasts (sonner) render in the correct theme

- [ ] **Step 4: Final commit if needed**

```bash
git add -A
git commit -m "fix: address any remaining theme issues"
```
