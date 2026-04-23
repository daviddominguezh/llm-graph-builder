import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export interface UseThemeResult {
  theme: Theme;
  toggle: () => void;
}

const STORAGE_KEY = 'openflow-widget-theme';

function readStored(): Theme | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
    return null;
  } catch {
    return null;
  }
}

function readSystem(): Theme {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  return mql.matches ? 'dark' : 'light';
}

function initialTheme(): Theme {
  return readStored() ?? readSystem();
}

export function applyTheme(theme: Theme): void {
  const { documentElement } = document;
  if (theme === 'dark') documentElement.classList.add('dark');
  else documentElement.classList.remove('dark');
}

export function resolveInitialTheme(): Theme {
  return initialTheme();
}

function persist(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* noop */
  }
}

export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(() => initialTheme());

  useEffect(() => {
    applyTheme(theme);
    persist(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggle };
}
