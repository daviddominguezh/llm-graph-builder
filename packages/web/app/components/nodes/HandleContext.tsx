"use client";

import { createContext, useContext } from "react";
import type { NodeKind } from "../../utils/nodeKind";

interface HandleContextValue {
  onSourceHandleClick?: (
    nodeId: string,
    handleId: string,
    event: React.MouseEvent
  ) => void;
  onZoomToNode?: (nodeId: string) => void;
  onDeleteOption?: (edgeId: string, from: string, to: string) => void;
  onAddOption?: (
    nodeId: string,
    nodeKind: NodeKind,
    event: React.MouseEvent
  ) => void;
  readOnly?: boolean;
  hideHandles?: boolean;
}

export const HandleContext = createContext<HandleContextValue>({});

export function useHandleContext() {
  return useContext(HandleContext);
}
