'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OutputSchemaEntity, ToolFieldValue } from '@daviddh/graph-types';
import type { Edge as RFFlowEdge, Node as RFFlowNode } from '@xyflow/react';
import { Check, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { RFEdgeData, RFNodeData } from '../../utils/graphTransformers';
import { checkPathCoverage } from '../../utils/pathCoverage';
import type { ToolInputProperty } from '../../utils/typeCompatibility';
import type { UpstreamOption } from './referenceDialogHelpers';
import { getUpstreamOptions } from './referenceDialogHelpers';

interface ReferenceConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fieldName: string;
  targetProperty: ToolInputProperty;
  sourceNodeId: string;
  nodes: Array<RFFlowNode<RFNodeData>>;
  edges: Array<RFFlowEdge<RFEdgeData>>;
  outputSchemas: OutputSchemaEntity[];
  currentValue?: ToolFieldValue;
  onApply: (value: ToolFieldValue) => void;
}

function NodeSelector({
  options,
  value,
  onChange,
}: {
  options: UpstreamOption[];
  value: string | undefined;
  onChange: (nodeId: string) => void;
}) {
  const t = useTranslations('referenceDialog');
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{t('selectNode')}</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger className="w-full" disabled={options.length === 0}>
          <SelectValue placeholder={t('selectNode')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.nodeId} value={opt.nodeId}>
              {opt.nodeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('noUpstreamNodes')}</p>
      )}
    </div>
  );
}

function FieldSelector({
  option,
  value,
  onChange,
}: {
  option: UpstreamOption | undefined;
  value: string | undefined;
  onChange: (path: string) => void;
}) {
  const t = useTranslations('referenceDialog');
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{t('selectField')}</Label>
      <Select
        value={value ?? ''}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger className="w-full" disabled={option === undefined}>
          <SelectValue placeholder={t('selectField')} />
        </SelectTrigger>
        <SelectContent>
          {option?.fields.map((field) => (
            <SelectItem key={field.name} value={field.name}>
              {field.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CoverageIndicator({ covered }: { covered: boolean | null }) {
  const t = useTranslations('referenceDialog');
  if (covered === null) return null;

  if (covered) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-600">
        <Check className="size-3.5" />
        <span>{t('pathCovered')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-600">
      <Info className="size-3.5" />
      <span>{t('pathNotCovered')}</span>
    </div>
  );
}

interface DialogBodyProps {
  options: UpstreamOption[];
  selectedNodeId: string | undefined;
  selectedPath: string | undefined;
  covered: boolean | null;
  onNodeChange: (nodeId: string) => void;
  onPathChange: (path: string) => void;
}

function DialogBody(props: DialogBodyProps) {
  const { options, selectedNodeId, selectedPath, covered, onNodeChange, onPathChange } = props;
  const selectedOption = options.find((o) => o.nodeId === selectedNodeId);

  return (
    <div className="flex flex-col gap-3">
      <NodeSelector options={options} value={selectedNodeId} onChange={onNodeChange} />
      <FieldSelector option={selectedOption} value={selectedPath} onChange={onPathChange} />
      <CoverageIndicator covered={covered} />
    </div>
  );
}

function useReferenceState(currentValue: ToolFieldValue | undefined) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(
    currentValue?.type === 'reference' ? currentValue.nodeId : undefined
  );
  const [selectedPath, setSelectedPath] = useState<string | undefined>(
    currentValue?.type === 'reference' ? currentValue.path : undefined
  );
  return { selectedNodeId, setSelectedNodeId, selectedPath, setSelectedPath };
}

export function ReferenceConfigDialog(props: ReferenceConfigDialogProps) {
  const t = useTranslations('referenceDialog');
  const { open, onOpenChange, fieldName, targetProperty, sourceNodeId, nodes, edges, outputSchemas, currentValue, onApply } =
    props;

  const upstreamOptions = getUpstreamOptions(nodes, edges, sourceNodeId, outputSchemas, targetProperty);
  const { selectedNodeId, setSelectedNodeId, selectedPath, setSelectedPath } =
    useReferenceState(currentValue);

  const coverage =
    selectedNodeId !== undefined ? checkPathCoverage(edges, sourceNodeId, selectedNodeId) : null;

  const isComplete =
    selectedNodeId !== undefined && selectedPath !== undefined && coverage?.covered === true;

  const handleNodeChange = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedPath(undefined);
  };

  const handleApply = () => {
    if (selectedNodeId === undefined || selectedPath === undefined) return;
    onApply({ type: 'reference', nodeId: selectedNodeId, path: selectedPath });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('title')}: {fieldName}
          </DialogTitle>
        </DialogHeader>
        <DialogBody
          options={upstreamOptions}
          selectedNodeId={selectedNodeId}
          selectedPath={selectedPath}
          covered={coverage?.covered ?? null}
          onNodeChange={handleNodeChange}
          onPathChange={setSelectedPath}
        />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{t('cancel')}</DialogClose>
          <Button onClick={handleApply} disabled={!isComplete}>
            {t('apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
