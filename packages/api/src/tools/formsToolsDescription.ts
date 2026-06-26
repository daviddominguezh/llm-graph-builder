import type { FormDefinition, ValidationRule } from '../types/forms.js';

const HEADER =
  'Persist (set_form_fields) or read (get_form_field) structured form data for this conversation.\n' +
  'Available forms on this agent:\n';

const FOOTER =
  '\nUse dotted paths with numeric indices for array items (e.g. "addresses[0].firstLine"). ' +
  'All fields must validate or none will be saved.';

const EMPTY = 0;

export function buildFormsToolDescription(forms: FormDefinition[]): string {
  if (forms.length === EMPTY) return 'No forms configured for this agent.';
  const body = forms.map(describeForm).join('\n');
  return `${HEADER}${body}${FOOTER}`;
}

function describeForm(f: FormDefinition): string {
  const rules = Object.entries(f.validations)
    .map(([path, rule]) => `    ${path}: ${describeRule(rule)}`)
    .join('\n');
  const rulesBlock = rules === '' ? '    (no validations)' : rules;
  return `  • ${f.formSlug}\n${rulesBlock}`;
}

const RULE_LABELS: Record<string, string> = {
  email: 'valid email',
  twoWordName: 'two-word name',
  pastDate: 'past date',
  futureDate: 'future date',
  pastHour: 'past hour',
  futureHour: 'future hour',
};

function describeRule(r: ValidationRule): string {
  if (r.kind === 'length') return describeLengthRule(r);
  return RULE_LABELS[r.kind] ?? r.kind;
}

function describeLengthRule(r: { kind: 'length'; min?: number; max?: number; exact?: number }): string {
  if (r.exact !== undefined) return `length exactly ${String(r.exact)}`;
  const parts: string[] = [];
  if (r.min !== undefined) parts.push(`≥${String(r.min)}`);
  if (r.max !== undefined) parts.push(`≤${String(r.max)}`);
  return `length ${parts.join(' ')}`;
}
