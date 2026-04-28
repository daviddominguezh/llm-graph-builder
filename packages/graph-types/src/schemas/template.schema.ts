import { z } from 'zod';

export const TEMPLATE_CATEGORIES = [
  'customer-support',
  'sales',
  'marketing',
  'engineering',
  'data-analysis',
  'content-creation',
  'research',
  'operations',
  'hr-recruiting',
  'legal-compliance',
  'finance',
  'education',
  'e-commerce',
] as const;

export const TemplateCategorySchema = z.enum(TEMPLATE_CATEGORIES);

export const LibraryMcpRefSchema = z.object({
  type: z.literal('library'),
  libraryItemId: z.string(),
  name: z.string(),
});

export const CustomMcpSkeletonSchema = z.object({
  type: z.literal('custom'),
  name: z.string(),
  transportType: z.string(),
  url: z.string().optional(),
  headerKeys: z.array(z.string()),
});

export const TemplateMcpServerSchema = z.discriminatedUnion('type', [
  LibraryMcpRefSchema,
  CustomMcpSkeletonSchema,
]);

const TemplateNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.string(),
  description: z.string().default(''),
  agent: z.string().optional(),
  nextNodeIsUser: z.boolean().optional(),
  fallbackNodeId: z.string().optional(),
  global: z.boolean().default(false),
  defaultFallback: z.boolean().optional(),
  outputSchemaId: z.string().optional(),
  outputPrompt: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

const TEMPLATE_TOOL_NAME_MIN_LEN = 1;
const TEMPLATE_TOOL_NAME_MAX_LEN = 100;

const TemplateToolRefSchema = z.object({
  providerType: z.enum(['builtin', 'mcp']),
  providerId: z.string().min(TEMPLATE_TOOL_NAME_MIN_LEN).max(TEMPLATE_TOOL_NAME_MAX_LEN),
  toolName: z.string().min(TEMPLATE_TOOL_NAME_MIN_LEN).max(TEMPLATE_TOOL_NAME_MAX_LEN),
});

/**
 * Templates carry preconditions in a slightly looser form than runtime graphs:
 * `value` covers user_said / agent_decision text; `tool` carries the full
 * SelectedTool ref for tool_call. Either field may be present depending on
 * `type`. Templates emitted before this enrichment have only `value` for
 * tool_call — those fall back to a `builtin/calendar` default at conversion
 * time, with a console warning so authors know to re-export the template.
 */
const TemplatePreconditionSchema = z.object({
  type: z.string(),
  value: z.string().optional(),
  tool: TemplateToolRefSchema.optional(),
  description: z.string().optional(),
});

const TemplateEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  preconditions: z.array(TemplatePreconditionSchema).optional(),
  contextPreconditions: z
    .object({ preconditions: z.array(z.string()), jumpTo: z.string().optional() })
    .optional(),
});

const TemplateAgentSchema = z.object({
  id: z.string(),
  description: z.string().default(''),
});

const TemplateOutputFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

const TemplateOutputSchemaSchema = z.object({
  id: z.string(),
  name: z.string(),
  fields: z.array(TemplateOutputFieldSchema),
});

export const TemplateGraphDataSchema = z.object({
  startNode: z.string(),
  nodes: z.array(TemplateNodeSchema),
  edges: z.array(TemplateEdgeSchema),
  agents: z.array(TemplateAgentSchema),
  contextPresets: z.array(z.object({ name: z.string() })).optional(),
  outputSchemas: z.array(TemplateOutputSchemaSchema).optional(),
  mcpServers: z.array(TemplateMcpServerSchema),
});

export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;
export type TemplateGraphData = z.infer<typeof TemplateGraphDataSchema>;
export type TemplateMcpServer = z.infer<typeof TemplateMcpServerSchema>;
