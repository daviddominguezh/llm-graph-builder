'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { Edge } from '@xyflow/react';
import { useTranslations } from 'next-intl';

import type { Dispatch } from '../../editor-actions/actionRegistry';
import type { HistorySnapshot } from '../../editor-history/historyStore';
import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { CommittedNodeTextarea } from './CommittedNodeTextarea';
import { OutputSchemaSelect } from './OutputSchemaSelect';

interface NodePanelOutputSchemaProps {
  nodeId: string;
  nodeData: RFNodeData;
  nodeType: string | undefined;
  outgoingEdges: Array<Edge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  getState: () => HistorySnapshot;
  dispatch: Dispatch;
  onUpdateNodeData: (updates: Partial<RFNodeData>) => void;
  onUpdateNodeDataLive: (updates: Partial<RFNodeData>) => void;
  onAddOutputSchema: () => string;
  onEditOutputSchema: (id: string) => void;
  onEditNewOutputSchema: (id: string) => void;
}

function hasRoutingPrecondition(edge: Edge<RFEdgeData>): boolean {
  const pType = edge.data?.preconditions?.[0]?.type;
  return pType === 'user_said' || pType === 'agent_decision' || pType === 'tool_call';
}

function hasContextPrecondition(edge: Edge<RFEdgeData>): boolean {
  const cp = edge.data?.contextPreconditions;
  return cp !== undefined && cp.preconditions.length > 0;
}

function isOutputSchemaHidden(nodeData: RFNodeData, outgoingEdges: Array<Edge<RFEdgeData>>): boolean {
  if (nodeData.nextNodeIsUser === true) return true;
  if (outgoingEdges.length > 1) return true;
  if (outgoingEdges.some(hasRoutingPrecondition)) return true;
  if (outgoingEdges.some(hasContextPrecondition)) return true;
  return false;
}

function OutputSchemaSection({
  nodeId,
  nodeData,
  outgoingEdges,
  outputSchemas,
  getState,
  dispatch,
  onUpdateNodeData,
  onUpdateNodeDataLive,
  onAddOutputSchema,
  onEditOutputSchema,
  onEditNewOutputSchema,
  t,
}: {
  nodeId: string;
  nodeData: RFNodeData;
  outgoingEdges: Array<Edge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  getState: () => HistorySnapshot;
  dispatch: Dispatch;
  onUpdateNodeData: (updates: Partial<RFNodeData>) => void;
  onUpdateNodeDataLive: (updates: Partial<RFNodeData>) => void;
  onAddOutputSchema: () => string;
  onEditOutputSchema: (id: string) => void;
  onEditNewOutputSchema: (id: string) => void;
  t: (key: string) => string;
}) {
  const hidden = isOutputSchemaHidden(nodeData, outgoingEdges);

  if (hidden) return null;

  const handleAddSchema = () => {
    const id = onAddOutputSchema();
    onEditNewOutputSchema(id);
  };

  return (
    <>
      <OutputSchemaSelect
        schemas={outputSchemas}
        value={nodeData.outputSchemaId}
        onChange={(schemaId) => onUpdateNodeData({ outputSchemaId: schemaId })}
        onAddSchema={handleAddSchema}
        onEditSchema={onEditOutputSchema}
      />
      {nodeData.outputSchemaId !== undefined && (
        <div className="space-y-2">
          <Label htmlFor="outputPrompt">{t('outputPrompt')}</Label>
          <CommittedNodeTextarea
            key={`${nodeId}:outputPrompt`}
            id="outputPrompt"
            nodeId={nodeId}
            fieldKey={`${nodeId}:outputPrompt`}
            value={nodeData.outputPrompt ?? ''}
            getState={getState}
            dispatch={dispatch}
            onValueChange={(v) => onUpdateNodeDataLive({ outputPrompt: v })}
            rows={3}
            placeholder={t('outputPromptPlaceholder')}
          />
        </div>
      )}
    </>
  );
}

export function NodePanelOutputSchema({
  nodeId,
  nodeData,
  nodeType,
  outgoingEdges,
  outputSchemas,
  getState,
  dispatch,
  onUpdateNodeData,
  onUpdateNodeDataLive,
  onAddOutputSchema,
  onEditOutputSchema,
  onEditNewOutputSchema,
}: NodePanelOutputSchemaProps) {
  const t = useTranslations('nodePanel');
  const isNextNodeUserDisabled = nodeData.outputSchemaId !== undefined;

  return (
    <>
      {nodeType === 'agent' && (
        <OutputSchemaSection
          nodeId={nodeId}
          nodeData={nodeData}
          outgoingEdges={outgoingEdges}
          outputSchemas={outputSchemas}
          getState={getState}
          dispatch={dispatch}
          onUpdateNodeData={onUpdateNodeData}
          onUpdateNodeDataLive={onUpdateNodeDataLive}
          onAddOutputSchema={onAddOutputSchema}
          onEditOutputSchema={onEditOutputSchema}
          onEditNewOutputSchema={onEditNewOutputSchema}
          t={t}
        />
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="nextNodeIsUser"
            checked={nodeData.nextNodeIsUser ?? false}
            disabled={isNextNodeUserDisabled}
            onCheckedChange={(checked) =>
              onUpdateNodeData({
                nextNodeIsUser: checked === true,
              })
            }
          />
          <Label htmlFor="nextNodeIsUser">Next node expects user input</Label>
        </div>
      </div>
    </>
  );
}
