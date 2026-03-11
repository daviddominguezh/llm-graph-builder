'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';
import type { Edge } from '@xyflow/react';
import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { OutputSchemaSelect } from './OutputSchemaSelect';

interface NodePanelOutputSchemaProps {
  nodeData: RFNodeData;
  nodeType: string | undefined;
  outgoingEdges: Array<Edge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  onUpdateNodeData: (updates: Partial<RFNodeData>) => void;
  onAddOutputSchema: () => string;
  onEditOutputSchema: (id: string) => void;
}

function hasRoutingPrecondition(edge: Edge<RFEdgeData>): boolean {
  const pType = edge.data?.preconditions?.[0]?.type;
  return pType === 'user_said' || pType === 'agent_decision' || pType === 'tool_call';
}

function hasContextPrecondition(edge: Edge<RFEdgeData>): boolean {
  const cp = edge.data?.contextPreconditions;
  return cp !== undefined && cp.preconditions.length > 0;
}

function isOutputSchemaDisabled(nodeData: RFNodeData, outgoingEdges: Array<Edge<RFEdgeData>>): boolean {
  if (nodeData.nextNodeIsUser === true) return true;
  if (outgoingEdges.length > 1) return true;
  if (outgoingEdges.some(hasRoutingPrecondition)) return true;
  if (outgoingEdges.some(hasContextPrecondition)) return true;
  return false;
}

function getDisableReason(
  nodeData: RFNodeData,
  outgoingEdges: Array<Edge<RFEdgeData>>,
  t: (key: string) => string
): string | null {
  if (nodeData.nextNodeIsUser === true) return t('outputSchemaDisabledNextNodeIsUser');
  if (outgoingEdges.length > 1) return t('outputSchemaDisabledMultipleEdges');
  if (outgoingEdges.some(hasRoutingPrecondition)) return t('outputSchemaDisabledPreconditions');
  if (outgoingEdges.some(hasContextPrecondition)) return t('outputSchemaDisabledContextPreconditions');
  return null;
}

function OutputSchemaSection({
  nodeData,
  outgoingEdges,
  outputSchemas,
  onUpdateNodeData,
  onAddOutputSchema,
  onEditOutputSchema,
  t,
}: {
  nodeData: RFNodeData;
  outgoingEdges: Array<Edge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  onUpdateNodeData: (updates: Partial<RFNodeData>) => void;
  onAddOutputSchema: () => string;
  onEditOutputSchema: (id: string) => void;
  t: (key: string) => string;
}) {
  const disabled = isOutputSchemaDisabled(nodeData, outgoingEdges);
  const disableReason = getDisableReason(nodeData, outgoingEdges, t);

  const handleAddSchema = () => {
    const id = onAddOutputSchema();
    onUpdateNodeData({ outputSchemaId: id });
    onEditOutputSchema(id);
  };

  return (
    <>
      <OutputSchemaSelect
        schemas={outputSchemas}
        value={nodeData.outputSchemaId}
        onChange={(schemaId) => onUpdateNodeData({ outputSchemaId: schemaId })}
        onAddSchema={handleAddSchema}
        onEditSchema={onEditOutputSchema}
        disabled={disabled}
      />
      {disabled && disableReason !== null && (
        <p className="text-xs text-muted-foreground">{disableReason}</p>
      )}
      {nodeData.outputSchemaId !== undefined && (
        <div className="space-y-2">
          <Label htmlFor="outputPrompt">{t('outputPrompt')}</Label>
          <Textarea
            id="outputPrompt"
            value={nodeData.outputPrompt ?? ''}
            onChange={(e) => onUpdateNodeData({ outputPrompt: e.target.value })}
            rows={3}
            placeholder={t('outputPromptPlaceholder')}
          />
        </div>
      )}
    </>
  );
}

export function NodePanelOutputSchema({
  nodeData,
  nodeType,
  outgoingEdges,
  outputSchemas,
  onUpdateNodeData,
  onAddOutputSchema,
  onEditOutputSchema,
}: NodePanelOutputSchemaProps) {
  const t = useTranslations('nodePanel');
  const isNextNodeUserDisabled = nodeData.outputSchemaId !== undefined;

  return (
    <>
      {nodeType === 'agent' && (
        <OutputSchemaSection
          nodeData={nodeData}
          outgoingEdges={outgoingEdges}
          outputSchemas={outputSchemas}
          onUpdateNodeData={onUpdateNodeData}
          onAddOutputSchema={onAddOutputSchema}
          onEditOutputSchema={onEditOutputSchema}
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
                nextNodeIsUser: checked === true || undefined,
              })
            }
          />
          <Label htmlFor="nextNodeIsUser">Next node expects user input</Label>
        </div>
      </div>
    </>
  );
}
