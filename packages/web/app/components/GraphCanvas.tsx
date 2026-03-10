'use client';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  type Connection,
} from '@xyflow/react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { SimulationPanel } from './panels/simulation';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { START_NODE_ID } from '../utils/graphInitializer';
import type { SimulationState } from '../hooks/useSimulation';

interface GraphCanvasProps {
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
}

function minimapNodeColor(node: Node): string {
  if (node.id === START_NODE_ID) return '#22c55e';
  return '#e2e8f0';
}

function ZoomViewOverlay({
  simulation,
  onExitZoomView,
}: Pick<GraphCanvasProps, 'simulation' | 'onExitZoomView'>) {
  return (
    <div className="absolute top-3 left-13 z-10">
      <Button variant="secondary" onClick={simulation.active ? simulation.stop : onExitZoomView}>
        <X className="h-3 w-3" />
        {simulation.active ? 'Stop simulation' : 'Quit zoom view'}
      </Button>
    </div>
  );
}

export function GraphCanvas({
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
}: GraphCanvasProps) {
  return (
    <div className="h-screen w-screen relative flex-1 overflow-hidden">
      <main ref={reactFlowWrapper} className="absolute inset-0">
        <ReactFlow
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
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <Background />
          <Controls />
          <MiniMap nodeStrokeWidth={3} nodeColor={minimapNodeColor} maskColor="rgba(0, 0, 0, 0.1)" />
        </ReactFlow>

        {zoomViewNodeId !== null && <ZoomViewOverlay simulation={simulation} onExitZoomView={onExitZoomView} />}

        {simulation.active && (
          <SimulationPanel
            lastUserText={simulation.lastUserText}
            nodeResults={simulation.nodeResults}
            visitedNodes={simulation.visitedNodes}
            terminated={simulation.terminated}
            loading={simulation.loading}
            onSendMessage={simulation.sendMessage}
            onStop={simulation.stop}
          />
        )}
      </main>
    </div>
  );
}
