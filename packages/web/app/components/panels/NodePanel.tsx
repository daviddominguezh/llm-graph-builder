'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { useEdges, useNodes, useReactFlow } from '@xyflow/react';
import type { Edge, Node } from '@xyflow/react';
import { ArrowLeft, ArrowRight, Box, Brain, Cable, MessageCircle, Send, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';

import type { Agent, PreconditionType } from '../../schemas/graph.schema';
import type { ContextPreset } from '../../types/preset';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import type { PushOperation } from '../../utils/operationBuilders';
import { FallbackNodeSelect } from './FallbackNodeSelect';
import { NodePanelOutputSchema } from './NodePanelOutputSchema';
import { NodePromptDialog } from './NodePromptDialog';
import { pushDeleteNode, pushRenameNode, pushUpdateNode } from './nodePanelOps';
import { hasToolCallEdge } from './toolCallGuard';
import { getPreconditionDisplayValue } from '../../utils/preconditionHelpers';

interface NodePanelProps {
  nodeId: string;
  allNodes: Array<Node<RFNodeData>>;
  agents: Agent[];
  presets: ContextPreset[];
  activePresetId: string;
  globalNodeIds: string[];
  onSetActivePreset: (id: string) => void;
  onNodeDeleted?: () => void;
  onNodeIdChanged?: (newId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  pushOperation: PushOperation;
  outputSchemas: OutputSchemaEntity[];
  onAddOutputSchema: () => string;
  onEditOutputSchema: (id: string) => void;
  onEditNewOutputSchema: (id: string) => void;
}

export function NodePanel({
  nodeId,
  allNodes,
  agents,
  presets,
  activePresetId,
  globalNodeIds,
  onSetActivePreset,
  onNodeDeleted,
  onNodeIdChanged,
  onSelectEdge,
  onSelectNode,
  pushOperation,
  outputSchemas,
  onAddOutputSchema,
  onEditOutputSchema,
  onEditNewOutputSchema,
}: NodePanelProps) {
  const nodes = useNodes<Node<RFNodeData>>();
  const edges = useEdges<Edge<RFEdgeData>>();
  const { setNodes, setEdges } = useReactFlow();

  // Get incoming and outgoing edges
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const outgoingEdges = edges.filter((e) => e.source === nodeId);
  const isToolCallNode = hasToolCallEdge(outgoingEdges);
  const isUserSaidNode = outgoingEdges.some((e) =>
    e.data?.preconditions?.some((p) => p.type === 'user_said')
  );

  const node = nodes.find((n) => n.id === nodeId);
  const nodeData = node?.data;

  const [prevNodeId, setPrevNodeId] = useState(nodeId);
  const [id, setId] = useState(node?.id ?? '');

  // Reset form when selecting a different node
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId);
    const currentNode = nodes.find((n) => n.id === nodeId);
    if (currentNode) {
      setId(currentNode.id);
    }
  }

  if (!node || !nodeData) {
    return null;
  }

  const updateNodeData = (updates: Partial<RFNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)));
    pushUpdateNode(node, updates, pushOperation);
  };

  const handleIdBlur = () => {
    if (id !== nodeId && id.trim()) {
      const newId = id.trim();
      const renamedNode = { ...node, id: newId, data: { ...node.data, nodeId: newId } };
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? renamedNode : n)));
      setEdges((eds) =>
        eds.map((e) => {
          const newSource = e.source === nodeId ? newId : e.source;
          const newTarget = e.target === nodeId ? newId : e.target;
          return { ...e, id: `${newSource}-${newTarget}`, source: newSource, target: newTarget };
        })
      );
      pushRenameNode(nodeId, renamedNode, edges, pushOperation);
      onNodeIdChanged?.(newId);
    }
  };

  const handleDelete = () => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    pushDeleteNode(nodeId, pushOperation);
    onNodeDeleted?.();
  };

  const getEdgeTypeIcon = (edge: Edge<RFEdgeData>) => {
    const iconClass = 'h-3 w-3 mr-1';

    const preconditionType = edge.data?.preconditions?.[0]?.type as PreconditionType | undefined;
    if (!preconditionType) return <Send className={`${iconClass} text-green-700`} />;

    switch (preconditionType) {
      case 'user_said':
        return <MessageCircle className={`${iconClass} text-green-700`} />;
      case 'agent_decision':
        return <Brain className={`${iconClass} text-purple-700`} />;
      case 'tool_call':
        return <Wrench className={`${iconClass} text-orange-700`} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2 px-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Node Properties</h4>
          <div className="flex items-center">
            <NodePromptDialog
              nodeId={nodeId}
              allNodes={allNodes}
              agents={agents}
              presets={presets}
              activePresetId={activePresetId}
              onSetActivePreset={onSetActivePreset}
              outputSchemas={outputSchemas}
            />

            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="icon" title="Delete node">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete node?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the node and remove all its
                    connections.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={handleDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <div className="space-y-2">
            <Label htmlFor="id">ID</Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              onBlur={handleIdBlur}
              placeholder="Node ID..."
            />
          </div>

          {!isToolCallNode && (
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={nodeData.description}
                onChange={(e) => updateNodeData({ description: e.target.value })}
                rows={2}
                placeholder="Node description..."
              />
            </div>
          )}

          {isUserSaidNode && (
            <div className="space-y-2">
              <Label htmlFor="text">Text</Label>
              <Textarea
                id="text"
                value={nodeData.text}
                onChange={(e) => updateNodeData({ text: e.target.value })}
                rows={3}
                placeholder="Node text..."
              />
            </div>
          )}

          <NodePanelOutputSchema
            nodeData={nodeData}
            nodeType={node.type}
            outgoingEdges={outgoingEdges}
            outputSchemas={outputSchemas}
            onUpdateNodeData={updateNodeData}
            onAddOutputSchema={onAddOutputSchema}
            onEditOutputSchema={onEditOutputSchema}
            onEditNewOutputSchema={onEditNewOutputSchema}
          />
        </div>

        <Separator />

        <div className="p-4">
          <Label className="text-sm font-semibold">Connections</Label>

          {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">No connections</p>
          )}

          {incomingEdges.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-1 items-center text-xs mb-1 font-medium">
                Incoming
                <ArrowLeft className="h-3 w-3 mr-1" />
              </div>
              <div className="flex flex-col ml-2 gap-1">
                {incomingEdges.map((edge) => {
                  const firstPrecondition = edge.data?.preconditions?.[0];
                  const value = firstPrecondition ? getPreconditionDisplayValue(firstPrecondition) : undefined;
                  const contextPreconditions = edge.data?.contextPreconditions;
                  const hasContext = contextPreconditions && contextPreconditions.preconditions.length > 0;
                  return (
                    <div key={edge.id}>
                      <div className="w-full flex justify-between items-start text-xs gap-1 py-1">
                        <div className="flex flex-1 min-w-[0px] flex-col">
                          <div className="flex items-center">
                            {getEdgeTypeIcon(edge)}
                            <span className="ml-0.5 text-[11px]">{edge.source}</span>
                          </div>
                          {(value || hasContext) && (
                            <div className="flex w-full gap-3 mt-1 bg-input dark:bg-input/30 rounded-e-sm py-0">
                              <div className="shrink-0 w-[2px] bg-ring self-stretch"></div>
                              <div className="w-full text-[10px] text-muted-foreground py-1">
                                {value && <div className="w-full">{value}</div>}
                                {hasContext && (
                                  <div className={value ? 'mt-1' : ''}>
                                    <span>Context:</span> {contextPreconditions.preconditions.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="aspect-square p-0 h-6"
                                  onClick={() => onSelectNode?.(edge.source)}
                                >
                                  <Box />
                                </Button>
                              }
                            ></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm">
                              Go to node
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="aspect-square p-0 h-6"
                                  onClick={() => onSelectEdge?.(edge.id)}
                                >
                                  <Cable />
                                </Button>
                              }
                            ></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm">
                              Go to edge
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {outgoingEdges.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-1 items-center text-xs mb-1 font-medium">
                Outgoing
                <ArrowRight className="h-3 w-3 mr-1" />
              </div>
              <div className="flex flex-col ml-2 gap-1">
                {outgoingEdges.map((edge) => {
                  const firstPrecondition = edge.data?.preconditions?.[0];
                  const value = firstPrecondition ? getPreconditionDisplayValue(firstPrecondition) : undefined;
                  const contextPreconditions = edge.data?.contextPreconditions;
                  const hasContext = contextPreconditions && contextPreconditions.preconditions.length > 0;
                  return (
                    <div key={edge.id}>
                      <div className="w-full flex justify-between items-start text-xs gap-1 py-1">
                        <div className="flex flex-1 flex-col min-w-[0px]">
                          <div className="flex items-center">
                            {getEdgeTypeIcon(edge)}
                            <span className="ml-0.5 text-[11px]">{edge.target}</span>
                          </div>
                          {(value || hasContext) && (
                            <div className="flex w-full gap-3 mt-1 bg-input dark:bg-input/30 rounded-e-sm py-0">
                              <div className="shrink-0 ml-0 w-[2px] bg-ring self-stretch"></div>
                              <div className="w-full text-[10px] text-muted-foreground py-1">
                                {value && <div className="w-full">{value}</div>}
                                {hasContext && (
                                  <div className={value ? 'mt-1' : ''}>
                                    <span>Context:</span> {contextPreconditions.preconditions.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center shrink-0">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="aspect-square p-0 h-6"
                                  onClick={() => onSelectNode?.(edge.target)}
                                >
                                  <Box />
                                </Button>
                              }
                            ></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm">
                              Go to node
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="aspect-square p-0 h-6"
                                  onClick={() => onSelectEdge?.(edge.id)}
                                >
                                  <Cable />
                                </Button>
                              }
                            ></TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm">
                              Go to edge
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <FallbackNodeSelect
            nodeId={nodeId}
            edges={edges}
            globalNodeIds={globalNodeIds}
            value={nodeData.fallbackNodeId}
            onChange={(fallbackId) => updateNodeData({ fallbackNodeId: fallbackId })}
          />
        </div>
      </div>
    </div>
  );
}
