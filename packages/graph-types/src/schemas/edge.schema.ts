import { z } from 'zod';

export const PreconditionTypeSchema = z.enum(['user_said', 'agent_decision', 'tool_call']);

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

export const PreconditionSchema = z.object({
  type: PreconditionTypeSchema,
  value: z.string(),
  description: z.string().optional(),
  toolFields: z.record(z.string(), ToolFieldValueSchema).optional(),
});

export const ContextPreconditionsSchema = z.object({
  preconditions: z.array(z.string()),
  jumpTo: z.string().optional(),
});

type PreconditionInput = z.infer<typeof PreconditionSchema>;

const EMPTY_LENGTH = 0;
const FIRST_INDEX = 0;

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

export const EdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  preconditions: PreconditionsArraySchema.optional(),
  contextPreconditions: ContextPreconditionsSchema.optional(),
});

export const RuntimeEdgeSchema = EdgeSchema.extend({
  label: z.string().optional(),
});
