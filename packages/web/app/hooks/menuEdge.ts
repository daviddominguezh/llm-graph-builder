import { nanoid } from 'nanoid';

import type { Precondition } from '../schemas/graph.schema';
import { START_NODE_ID } from '../utils/graphInitializer';
import type { RFEdgeData } from '../utils/graphTransformers';
import type { NodeKind } from '../utils/nodeKind';
import { makePrecondition } from '../utils/preconditionHelpers';

const NANOID_LENGTH = 8;

const DEFAULT_USER_SAID: Precondition = { type: 'user_said', value: '' };

// Minimal structural input for menu-edge construction. `ConnectionMenuState` in
// useGraphActions is structurally compatible and can be passed directly, avoiding a
// circular import between the two modules.
interface MenuEdgeSource {
  sourceNodeId: string;
  sourceHandleId: string | null;
  addOptionKind?: NodeKind;
}

function buildStartEdgeData(): RFEdgeData {
  return { preconditions: [{ ...DEFAULT_USER_SAID }] };
}

function buildOptionEdge(
  sourceNodeId: string,
  targetNodeId: string,
  nodeKind: NodeKind
): { id: string; edgeData: RFEdgeData } {
  const id = `${sourceNodeId}-${targetNodeId}-${nanoid(NANOID_LENGTH)}`;
  const type = nodeKind === 'user_routing' ? 'user_said' : 'agent_decision';
  return { id, edgeData: { preconditions: [makePrecondition({ type, value: '' })] } };
}

// Optional `id` is only present for row-mode "add option" edges (where sourceHandle must
// equal the edge id). For all other edges the key is omitted entirely so `addEdge` keeps
// generating the id itself (its `isEdgeBase` check keys off `'id' in element`).
interface MenuEdgeArg {
  id?: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string;
  type: 'precondition';
  data: RFEdgeData | undefined;
}

function buildMenuEdgeArg(
  menu: MenuEdgeSource,
  targetNodeId: string,
  fallbackTargetHandle: string
): { arg: MenuEdgeArg; edgeData: RFEdgeData | undefined } {
  if (menu.addOptionKind !== undefined) {
    const { id, edgeData } = buildOptionEdge(menu.sourceNodeId, targetNodeId, menu.addOptionKind);
    const arg: MenuEdgeArg = {
      id,
      source: menu.sourceNodeId,
      target: targetNodeId,
      sourceHandle: id,
      targetHandle: 'left-target',
      type: 'precondition',
      data: edgeData,
    };
    return { arg, edgeData };
  }
  const edgeData = menu.sourceNodeId === START_NODE_ID ? buildStartEdgeData() : undefined;
  const arg: MenuEdgeArg = {
    source: menu.sourceNodeId,
    target: targetNodeId,
    sourceHandle: menu.sourceHandleId,
    targetHandle: fallbackTargetHandle,
    type: 'precondition',
    data: edgeData,
  };
  return { arg, edgeData };
}

export type { MenuEdgeArg, MenuEdgeSource };
export { buildMenuEdgeArg };
