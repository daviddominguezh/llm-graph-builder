'use client';

import { Button } from '@/components/ui/button';
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  ReactFlow,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import type { SimulationState } from '../hooks/useSimulation';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { edgeTypes } from './edges';
import { nodeTypes } from './nodes';
import { SimulationPanel } from './panels/simulation';

interface GraphCanvasProps {
  agentId: string;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
  displayNodes: Array<Node<RFNodeData>>;
  edges: Array<Edge<RFEdgeData>>;
  onNodesChange: OnNodesChange<Node<RFNodeData>>;
  onEdgesChange: OnEdgesChange<Edge<RFEdgeData>>;
  onConnect: (params: Connection) => void;
  onNodeClick: (_: React.MouseEvent, node: Node) => void;
  onEdgeClick: (_: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
  zoomViewNodeId: string | null;
  simulation: SimulationState;
  onExitZoomView: () => void;
  readOnly?: boolean;
}

function ZoomViewOverlay({
  simulation,
  onExitZoomView,
}: Pick<GraphCanvasProps, 'simulation' | 'onExitZoomView'>) {
  if (simulation.active) return null;
  return (
    <div className="absolute top-2 left-11 z-10">
      <Button variant="secondary" onClick={onExitZoomView}>
        <X className="h-3 w-3" />
        Quit zoom view
      </Button>
    </div>
  );
}

export function GraphCanvas({
  agentId,
  reactFlowWrapper,
  displayNodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
  zoomViewNodeId,
  simulation,
  onExitZoomView,
  readOnly,
}: GraphCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, []);
  const colorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <div className="relative h-full w-full flex-1 overflow-hidden rounded-xl">
      <div ref={reactFlowWrapper} className="absolute inset-0 rounded-xl">
        <ReactFlow
          id={`flow-${agentId}`}
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={readOnly !== true}
          nodesConnectable={readOnly !== true}
          deleteKeyCode={null}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          colorMode={colorMode}
        >
          <Background color="var(--canvas-dots)" />
          <Controls position="bottom-right" className="mb-3.5! shadow-xs! rounded-lg" />
        </ReactFlow>

        {zoomViewNodeId !== null && (
          <ZoomViewOverlay simulation={simulation} onExitZoomView={onExitZoomView} />
        )}

        {simulation.active && (
          <SimulationPanel
            lastUserText={simulation.lastUserText}
            nodeResults={simulation.nodeResults}
            conversationEntries={simulation.conversationEntries}
            visitedNodes={simulation.visitedNodes}
            terminated={simulation.terminated}
            loading={simulation.loading}
            currentNode={simulation.currentNode}
            totalTokens={simulation.totalTokens}
            turnCount={simulation.turnCount}
            isAgent={simulation.isAgent}
            modelId={simulation.modelId}
            onModelIdChange={simulation.setModelId}
            onSendMessage={simulation.sendMessage}
            onStop={simulation.stop}
            onClear={simulation.clear}
          />
        )}
      </div>
    </div>
  );
}
