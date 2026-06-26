import type { ToolDescriptor } from '../provider.js';

const FORMS_DESCRIPTION =
  'Persist (set_form_fields) or read (get_form_field) structured form data for this conversation.\n' +
  'Available forms on this agent are listed at runtime.\n' +
  'Use dotted paths with numeric indices for array items (e.g. "addresses[0].firstLine"). ' +
  'All fields must validate or none will be saved.';

const MIN_LENGTH_SCHEMA = 'minLength: must not be empty';

const setFormFieldsSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    formSlug: {
      type: 'string',
      description: `Slug identifier of the form to write to. ${MIN_LENGTH_SCHEMA}`,
    },
    fields: {
      type: 'array',
      description: 'One or more field path/value pairs to set atomically.',
      items: {
        type: 'object',
        properties: {
          fieldPath: {
            type: 'string',
            description: `Dotted path to the field, e.g. "addresses[0].firstLine". ${MIN_LENGTH_SCHEMA}`,
          },
          fieldValue: {
            description: 'The value to write. Any JSON-serialisable type.',
          },
        },
        required: ['fieldPath', 'fieldValue'],
      },
    },
  },
  required: ['formSlug', 'fields'],
};

const getFormFieldSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    formSlug: {
      type: 'string',
      description: `Slug identifier of the form to read from. ${MIN_LENGTH_SCHEMA}`,
    },
    fieldPath: {
      type: 'string',
      description: `Dotted path to the field to read, e.g. "addresses[0].firstLine". ${MIN_LENGTH_SCHEMA}`,
    },
  },
  required: ['formSlug', 'fieldPath'],
};

export const FORMS_DESCRIPTORS: ToolDescriptor[] = [
  {
    toolName: 'set_form_fields',
    description: FORMS_DESCRIPTION,
    inputSchema: setFormFieldsSchema,
  },
  {
    toolName: 'get_form_field',
    description: FORMS_DESCRIPTION,
    inputSchema: getFormFieldSchema,
  },
];
