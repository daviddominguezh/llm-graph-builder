import { z } from 'zod';

const MAX_NAME_LEN = 100;
const MIN_NAME_LEN = 1;
const EMPTY_LENGTH = 0;
const FIRST_INDEX = 0;

const SelectedToolRefSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string().min(MIN_NAME_LEN).max(MAX_NAME_LEN),
  toolName: z.string().min(MIN_NAME_LEN).max(MAX_NAME_LEN),
});

/** Explicit type required for z.lazy() recursive reference. */
export type ToolFieldValue =
  | { type: 'fixed'; value: string }
  | { type: 'reference'; nodeId: string; path: string; fallbacks?: ToolFieldValue[] };

const FixedFieldValueSchema = z.object({ type: z.literal('fixed'), value: z.string() });

export const ToolFieldValueSchema: z.ZodType<ToolFieldValue> = z.lazy(() =>
  z.union([
    FixedFieldValueSchema,
    z.object({
      type: z.literal('reference'),
      nodeId: z.string(),
      path: z.string(),
      fallbacks: z.array(ToolFieldValueSchema).optional(),
    }),
  ])
);

export const PreconditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_said'),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('agent_decision'),
    value: z.string(),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('tool_call'),
    tool: SelectedToolRefSchema,
    description: z.string().optional(),
    toolFields: z.record(z.string(), ToolFieldValueSchema).optional(),
  }),
]);

export const PreconditionTypeSchema = z.enum(['user_said', 'agent_decision', 'tool_call']);

type PreconditionInput = z.infer<typeof PreconditionSchema>;

const allSameType = (preconditions: PreconditionInput[]): boolean => {
  if (preconditions.length === EMPTY_LENGTH) return true;
  const firstType = preconditions[FIRST_INDEX]?.type;
  return preconditions.every((p) => p.type === firstType);
};

const SAME_TYPE_MESSAGE =
  'All preconditions in an edge must have the same type (user_said, agent_decision, or tool_call)';

export const PreconditionsArraySchema = z
  .array(PreconditionSchema)
  .refine(allSameType, { message: SAME_TYPE_MESSAGE });

export const ContextPreconditionsSchema = z.object({
  preconditions: z.array(z.string()),
  jumpTo: z.string().optional(),
});

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  preconditions: PreconditionsArraySchema.optional(),
  contextPreconditions: ContextPreconditionsSchema.optional(),
});

export const RuntimeEdgeSchema = EdgeSchema.extend({
  label: z.string().optional(),
});
