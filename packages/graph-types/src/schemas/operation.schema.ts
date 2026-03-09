import { z } from 'zod';

import {
  DeleteAgentOperationSchema,
  InsertAgentOperationSchema,
  UpdateAgentOperationSchema,
} from './operation-agent.schema.js';
import {
  DeleteContextPresetOperationSchema,
  InsertContextPresetOperationSchema,
  UpdateContextPresetOperationSchema,
} from './operation-context-preset.schema.js';
import {
  DeleteEdgeOperationSchema,
  InsertEdgeOperationSchema,
  UpdateEdgeOperationSchema,
} from './operation-edge.schema.js';
import {
  DeleteMcpServerOperationSchema,
  InsertMcpServerOperationSchema,
  UpdateMcpServerOperationSchema,
} from './operation-mcp.schema.js';
import {
  DeleteNodeOperationSchema,
  InsertNodeOperationSchema,
  UpdateNodeOperationSchema,
} from './operation-node.schema.js';
import { UpdateStartNodeOperationSchema } from './operation-start-node.schema.js';

export const OperationSchema = z.discriminatedUnion('type', [
  InsertNodeOperationSchema,
  UpdateNodeOperationSchema,
  DeleteNodeOperationSchema,
  InsertEdgeOperationSchema,
  UpdateEdgeOperationSchema,
  DeleteEdgeOperationSchema,
  InsertAgentOperationSchema,
  UpdateAgentOperationSchema,
  DeleteAgentOperationSchema,
  InsertMcpServerOperationSchema,
  UpdateMcpServerOperationSchema,
  DeleteMcpServerOperationSchema,
  InsertContextPresetOperationSchema,
  UpdateContextPresetOperationSchema,
  DeleteContextPresetOperationSchema,
  UpdateStartNodeOperationSchema,
]);

export const OperationsBatchSchema = z.object({
  operations: z.array(OperationSchema),
});

export {
  InsertNodeOperationSchema,
  UpdateNodeOperationSchema,
  DeleteNodeOperationSchema,
} from './operation-node.schema.js';
export {
  InsertEdgeOperationSchema,
  UpdateEdgeOperationSchema,
  DeleteEdgeOperationSchema,
} from './operation-edge.schema.js';
export {
  InsertAgentOperationSchema,
  UpdateAgentOperationSchema,
  DeleteAgentOperationSchema,
} from './operation-agent.schema.js';
export {
  InsertMcpServerOperationSchema,
  UpdateMcpServerOperationSchema,
  DeleteMcpServerOperationSchema,
} from './operation-mcp.schema.js';
export {
  InsertContextPresetOperationSchema,
  UpdateContextPresetOperationSchema,
  DeleteContextPresetOperationSchema,
} from './operation-context-preset.schema.js';
export { UpdateStartNodeOperationSchema } from './operation-start-node.schema.js';
