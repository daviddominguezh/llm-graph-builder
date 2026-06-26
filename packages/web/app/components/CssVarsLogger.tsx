'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    listCssVars: (selector?: string) => Record<string, string>;
    listAllCssVars: () => Record<string, string>;
  }
}

function addIfCssVar(styles: CSSStyleDeclaration, name: string, vars: Record<string, string>): void {
  if (!name.startsWith('--')) return;
  vars[name] = styles.getPropertyValue(name).trim();
}

function collectComputedCssVars(styles: CSSStyleDeclaration): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < styles.length; i++) {
    addIfCssVar(styles, styles.item(i), vars);
  }
  return vars;
}

function listCssVars(selector: string = ':root'): Record<string, string> {
  const el = document.querySelector(selector);
  if (el === null) return {};
  return collectComputedCssVars(getComputedStyle(el));
}

function setVarFromRule(rule: CSSStyleRule, index: number, vars: Map<string, string>): void {
  const name = rule.style.item(index);
  if (!name.startsWith('--')) return;
  vars.set(name, rule.style.getPropertyValue(name).trim());
}

function collectFromRule(rule: CSSStyleRule, vars: Map<string, string>): void {
  for (let i = 0; i < rule.style.length; i++) {
    setVarFromRule(rule, i, vars);
  }
}

function getRules(sheet: CSSStyleSheet): CSSRuleList | null {
  try {
    return sheet.cssRules;
  } catch {
    return null;
  }
}

function collectRule(rule: CSSRule | null, vars: Map<string, string>): void {
  if (rule instanceof CSSStyleRule) collectFromRule(rule, vars);
}

function collectFromSheet(sheet: CSSStyleSheet | null, vars: Map<string, string>): void {
  if (sheet === null) return;
  const rules = getRules(sheet);
  if (rules === null) return;
  for (let i = 0; i < rules.length; i++) {
    collectRule(rules.item(i), vars);
  }
}

function listAllCssVars(): Record<string, string> {
  const vars = new Map<string, string>();
  for (let i = 0; i < document.styleSheets.length; i++) {
    collectFromSheet(document.styleSheets.item(i), vars);
  }
  return Object.fromEntries(vars);
}

export function CssVarsLogger(): null {
  useEffect(() => {
    window.listCssVars = listCssVars;
    window.listAllCssVars = listAllCssVars;
  }, []);
  return null;
}
