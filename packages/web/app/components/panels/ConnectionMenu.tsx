'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxCollection,
} from '@/components/ui/combobox';
import { ChevronDown, Info, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ExistingEdgeType } from '../../utils/edgeTypeUtils';
import { IfElseDialog, LoopDialog, ToolNodeDialog, UserNodeDialog } from './nodeCreationDialogs';
import { NodeTypeDropdown, type NodeCreationType } from './NodeTypeDropdown';

const START_NODE_ID = 'INITIAL_STEP';

type ActiveDialog = 'user' | 'tool' | 'ifElse' | 'loop' | null;

interface ConnectionMenuProps {
  position: { x: number; y: number };
  sourceNodeId: string;
  sourceHandleId: string | null;
  sourceEdgeType: ExistingEdgeType;
  nodes: Array<{ id: string; text: string }>;
  onSelectNode: (targetNodeId: string) => void;
  onCreateNode: () => void;
  onCreateUserNode: (value: string) => void;
  onCreateToolNode: (toolName: string) => void;
  onCreateIfElse: (branchA: string, branchB: string) => void;
  onCreateLoop: (
    connection: { type: 'none' | 'user_said' | 'tool_call'; value: string },
    continueValue: string,
    exitValue: string,
  ) => void;
  onClose: () => void;
}

interface DialogsProps {
  activeDialog: ActiveDialog;
  sourceLabel: string;
  sourceEdgeType: ExistingEdgeType;
  onClose: () => void;
  onCreateUserNode: (value: string) => void;
  onCreateToolNode: (toolName: string) => void;
  onCreateIfElse: (branchA: string, branchB: string) => void;
  onCreateLoop: (
    connection: { type: 'none' | 'user_said' | 'tool_call'; value: string },
    continueValue: string,
    exitValue: string,
  ) => void;
}

function ConnectionDialogs({
  activeDialog,
  sourceLabel,
  sourceEdgeType,
  onClose,
  onCreateUserNode,
  onCreateToolNode,
  onCreateIfElse,
  onCreateLoop,
}: DialogsProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <>
      <UserNodeDialog
        open={activeDialog === 'user'}
        onOpenChange={handleOpenChange}
        sourceNodeLabel={sourceLabel}
        onCreate={onCreateUserNode}
      />
      <ToolNodeDialog
        open={activeDialog === 'tool'}
        onOpenChange={handleOpenChange}
        sourceNodeLabel={sourceLabel}
        onCreate={onCreateToolNode}
      />
      <IfElseDialog
        open={activeDialog === 'ifElse'}
        onOpenChange={handleOpenChange}
        sourceNodeLabel={sourceLabel}
        onCreate={onCreateIfElse}
      />
      <LoopDialog
        open={activeDialog === 'loop'}
        onOpenChange={handleOpenChange}
        sourceNodeLabel={sourceLabel}
        sourceEdgeType={sourceEdgeType}
        onCreate={onCreateLoop}
      />
    </>
  );
}

export function ConnectionMenu({
  position,
  sourceNodeId,
  sourceEdgeType,
  nodes,
  onSelectNode,
  onCreateNode,
  onCreateUserNode,
  onCreateToolNode,
  onCreateIfElse,
  onCreateLoop,
  onClose,
}: ConnectionMenuProps) {
  const t = useTranslations('connectionMenu');
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const availableNodes = nodes.filter((n) => n.id !== sourceNodeId && n.id !== START_NODE_ID);
  const sourceLabel = nodes.find((n) => n.id === sourceNodeId)?.text ?? sourceNodeId;
  const isStart = sourceNodeId === START_NODE_ID;

  const handleNodeSelect = (value: string | null) => {
    if (value) onSelectNode(value);
  };

  const handleTypeSelect = (type: NodeCreationType) => {
    if (type === 'agent') {
      onCreateNode();
      return;
    }
    setActiveDialog(type);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 pointer-events-auto" onClick={onClose} />

      <div
        className="fixed z-50 w-64 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95 pointer-events-auto"
        style={{ left: position.x, top: position.y }}
      >
        <p className="text-xs text-muted-foreground p-3 px-3 pb-1">{t('connectToExisting')}</p>

        {availableNodes.length === 0 && (
          <div className="p-2 pt-0">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>{t('noNodesAvailable')}</AlertDescription>
            </Alert>
          </div>
        )}

        {availableNodes.length > 0 && (
          <div className="p-2 pt-0">
            <Combobox items={availableNodes} onValueChange={handleNodeSelect}>
              <ComboboxInput placeholder={t('searchNodes')} className="w-full" />
              <ComboboxContent>
                <ComboboxEmpty>{t('noNodesFound')}</ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(node) => (
                      <ComboboxItem key={node.id} value={node.id}>
                        {node.id}
                      </ComboboxItem>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        )}

        <Separator />

        <div className="p-2 py-3">
          <div className="flex">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 justify-start gap-2 rounded-r-none border-r-0"
              onClick={onCreateNode}
            >
              <Plus className="h-4 w-4" />
              {t('createNewNode')}
            </Button>
            <NodeTypeDropdown sourceEdgeType={sourceEdgeType} isStartNode={isStart} onSelect={handleTypeSelect}>
              <Button variant="outline" size="sm" className="rounded-l-none px-1.5">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </NodeTypeDropdown>
          </div>
        </div>
      </div>

      <ConnectionDialogs
        activeDialog={activeDialog}
        sourceLabel={sourceLabel}
        sourceEdgeType={sourceEdgeType}
        onClose={() => setActiveDialog(null)}
        onCreateUserNode={onCreateUserNode}
        onCreateToolNode={onCreateToolNode}
        onCreateIfElse={onCreateIfElse}
        onCreateLoop={onCreateLoop}
      />
    </>
  );
}
