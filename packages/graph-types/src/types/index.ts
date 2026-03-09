import type { z } from 'zod';

import type {
  AgentSchema,
  BaseNodeKindSchema,
  ContextPreconditionsSchema,
  ContextPresetSchema,
  EdgeSchema,
  GraphSchema,
  McpServerConfigSchema,
  McpTransportSchema,
  NodeSchema,
  OperationSchema,
  OperationsBatchSchema,
  PositionSchema,
  PreconditionSchema,
  PreconditionTypeSchema,
  RuntimeEdgeSchema,
  RuntimeGraphSchema,
  RuntimeNodeKindSchema,
  RuntimeNodeSchema,
} from '../schemas/index.js';

export type Agent = z.infer<typeof AgentSchema>;
export type ContextPreset = z.infer<typeof ContextPresetSchema>;
export type Position = z.infer<typeof PositionSchema>;
export type BaseNodeKind = z.infer<typeof BaseNodeKindSchema>;
export type RuntimeNodeKind = z.infer<typeof RuntimeNodeKindSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type RuntimeNode = z.infer<typeof RuntimeNodeSchema>;
export type PreconditionType = z.infer<typeof PreconditionTypeSchema>;
export type Precondition = z.infer<typeof PreconditionSchema>;
export type ContextPreconditions = z.infer<typeof ContextPreconditionsSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type RuntimeEdge = z.infer<typeof RuntimeEdgeSchema>;
export type Graph = z.infer<typeof GraphSchema>;
export type RuntimeGraph = z.infer<typeof RuntimeGraphSchema>;
export type McpTransport = z.infer<typeof McpTransportSchema>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type Operation = z.infer<typeof OperationSchema>;
export type OperationsBatch = z.infer<typeof OperationsBatchSchema>;
