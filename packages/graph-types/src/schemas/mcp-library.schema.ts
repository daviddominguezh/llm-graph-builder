import { z } from 'zod';

import { McpTransportSchema, VariableValueSchema } from './mcp.schema.js';

export { VariableValueSchema };

export const MCP_LIBRARY_CATEGORIES = [
  'Productivity',
  'Development',
  'Data & Analytics',
  'Communication',
  'Design',
  'DevOps & Infrastructure',
  'Security',
  'Finance',
  'AI & ML',
  'Project Management',
  'Customer Support',
  'Marketing',
  'Sales',
  'HR',
  'Legal',
  'Education',
  'Healthcare',
  'E-commerce',
  'Social Media',
  'Other',
] as const;

export const McpLibraryCategorySchema = z.enum(MCP_LIBRARY_CATEGORIES);

export const McpLibraryVariableSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const McpLibraryItemSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  orgName: z.string().optional(),
  name: z.string(),
  description: z.string(),
  category: McpLibraryCategorySchema,
  imageUrl: z.string().nullable().optional(),
  transportType: z.string(),
  transportConfig: z.record(z.string(), z.unknown()),
  transport: McpTransportSchema.optional(),
  variables: z.array(McpLibraryVariableSchema),
  installationsCount: z.number().default(0),
  publishedBy: z.string(),
  createdAt: z.string().optional(),
});

export const OrgEnvVariableSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  value: z.string(),
  isSecret: z.boolean().default(false),
  createdAt: z.string().optional(),
});
