import type { CreateTemplateRequestBody, WhatsAppTemplateVariable } from './types.js';

const BODY_MAX_LENGTH = 1600;
const FIRST_PLACEHOLDER = 1;
const INDEX_STEP = 1;

const PLACEHOLDER_TAG = /\{\{(?:[^\}]+)\}\}/gv;
const NUMERIC_ONLY = /^\d+$/v;
const BRACE_STRIP = /\{\{|\}\}/gv;

/**
 * Validate placeholders in body text are numeric and consecutive starting at 1.
 * Duplicates are allowed. Returns an error message or null when valid.
 */
export function validateBodyPlaceholders(bodyText: string): string | null {
  const placeholders = bodyText.match(PLACEHOLDER_TAG);
  if (placeholders === null) return null;

  const keys = placeholders.map((placeholder) => placeholder.replace(BRACE_STRIP, '').trim());

  for (const key of keys) {
    if (!NUMERIC_ONLY.test(key)) {
      return `Placeholder {{${key}}} must be a number (e.g. {{1}}, {{2}})`;
    }
  }

  const uniqueNumbers = [...new Set(keys.map(Number))].sort((a, b) => a - b);

  for (let i = 0; i < uniqueNumbers.length; i += INDEX_STEP) {
    const expected = i + FIRST_PLACEHOLDER;
    if (uniqueNumbers[i] !== expected) {
      return `Placeholders must be consecutive starting from 1. Found {{${String(uniqueNumbers[i])}}} but missing {{${String(expected)}}}`;
    }
  }

  return null;
}

function describeVariable(variable: WhatsAppTemplateVariable, index: number): string | null {
  const { key, name } = variable;
  if (key.trim() === '') {
    return `Variable ${String(index + FIRST_PLACEHOLDER)} is missing a key (e.g. "1", "2")`;
  }
  if (name.trim() === '') {
    return `Variable "${key}" is missing a name`;
  }
  return null;
}

export function validateVariableShape(variables: WhatsAppTemplateVariable[]): string | null {
  let index = 0;
  for (const variable of variables) {
    const error = describeVariable(variable, index);
    if (error !== null) return error;
    index += INDEX_STEP;
  }
  return null;
}

export function validateCreateBody(body: Partial<CreateTemplateRequestBody>): string | null {
  if (
    body.channelConnectionId === undefined ||
    body.name === undefined ||
    body.body === undefined ||
    body.category === undefined
  ) {
    return 'Fields channelConnectionId, name, body, and category are required';
  }
  if (body.body.length > BODY_MAX_LENGTH) {
    return `Template body must be ${String(BODY_MAX_LENGTH)} characters or fewer`;
  }
  return null;
}
