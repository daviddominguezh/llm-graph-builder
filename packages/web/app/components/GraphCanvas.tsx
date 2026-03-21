'use client';

import { useEffect, useState } from 'react';

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
import { useTheme } from 'next-themes';
import { X } from 'lucide-react';

import type { SimulationState } from '../hooks/useSimulation';
import type { RFEdgeData, RFNodeData } from '../utils/graphTransformers';
import { edgeTypes } from './edges';
import { nodeTypes } from './nodes';
import { SimulationPanel } from './panels/simulation';

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

function ZoomViewOverlay({
  simulation,
  onExitZoomView,
}: Pick<GraphCanvasProps, 'simulation' | 'onExitZoomView'>) {
  if (simulation.active) return null;
  return (
    <div className="absolute top-3 left-13 z-10">
      <Button variant="secondary" onClick={onExitZoomView}>
        <X className="h-3 w-3" />
        Quit zoom view
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
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const colorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <div className="relative h-full w-full flex-1 overflow-hidden">
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
          deleteKeyCode={null}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          colorMode={colorMode}
        >
          <Background />
          <Controls className='ml-[2px]! mb-[2px]!' />
        </ReactFlow>

        {zoomViewNodeId !== null && (
          <ZoomViewOverlay simulation={simulation} onExitZoomView={onExitZoomView} />
        )}

        {simulation.active && (
          <SimulationPanel
            lastUserText={simulation.lastUserText}
            nodeResults={simulation.nodeResults}
            visitedNodes={simulation.visitedNodes}
            terminated={simulation.terminated}
            loading={simulation.loading}
            currentNode={simulation.currentNode}
            totalTokens={simulation.totalTokens}
            modelId={simulation.modelId}
            onModelIdChange={simulation.setModelId}
            onSendMessage={simulation.sendMessage}
            onStop={simulation.stop}
          />
        )}
      </main>
    </div>
  );
}
