'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { DiscoveredTool } from '../../../lib/api';
import type { McpServerConfig } from '../../../schemas/graph.schema';
import type { ExistingEdgeType } from '../../../utils/edgeTypeUtils';
import { ToolCombobox } from '../ToolCombobox';
import { LoopPreview } from './MiniGraphPreview';

type LoopConnectionType = 'none' | 'user_said' | 'tool_call';

interface LoopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceNodeLabel: string;
  sourceEdgeType: ExistingEdgeType;
  onCreate: (
    connection: { type: LoopConnectionType; value: string },
    continueValue: string,
    exitValue: string
  ) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}

const CONNECTION_COLOR_MAP = {
  none: 'muted',
  user_said: 'green',
  tool_call: 'orange',
} as const;

function isConnectionEnabled(connType: LoopConnectionType, sourceEdgeType: ExistingEdgeType): boolean {
  if (sourceEdgeType === 'unset') return true;
  return connType === sourceEdgeType;
}

const TAB_BASE =
  'cursor-pointer inline-flex flex-1 items-center justify-center rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent';
const TAB_ACTIVE = 'bg-popover dark:bg-input text-foreground shadow-sm';
const TAB_INACTIVE = 'text-muted-foreground hover:text-foreground hover:bg-input dark:hover:bg-card';

function ConnectionTypeButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const state = active ? TAB_ACTIVE : TAB_INACTIVE;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${TAB_BASE} ${state} disabled:opacity-40 disabled:pointer-events-none`}
    >
      {label}
    </button>
  );
}

export function LoopDialog({
  open,
  onOpenChange,
  sourceNodeLabel,
  sourceEdgeType,
  onCreate,
  servers,
  discoveredTools,
}: LoopDialogProps) {
  const t = useTranslations('connectionMenu');

  const defaultConnection = resolveDefaultConnection(sourceEdgeType);
  const [connectionType, setConnectionType] = useState<LoopConnectionType>(defaultConnection);
  const [connectionValue, setConnectionValue] = useState('');
  const [continueValue, setContinueValue] = useState('');
  const [exitValue, setExitValue] = useState('');

  const handleCreate = () => {
    const connValue = connectionType === 'none' ? '' : connectionValue;
    onCreate({ type: connectionType, value: connValue.trim() }, continueValue.trim(), exitValue.trim());
    resetForm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setConnectionType(defaultConnection);
    setConnectionValue('');
    setContinueValue('');
    setExitValue('');
  };

  const canCreate = isLoopFormValid(connectionType, connectionValue, continueValue, exitValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[500px] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{t('createLoop')}</DialogTitle>
        </DialogHeader>
        <LoopPreview sourceLabel={sourceNodeLabel} connectionColor={CONNECTION_COLOR_MAP[connectionType]} />
        <div className="space-y-4 px-1 flex-1 mt-2">
          <div className="space-y-2">
            <Label className="text-xs">{t('connectionType')}</Label>
            <div className="inline-flex gap-1 dark:gap-0.5 rounded-sm border bg-muted/50 p-0.5">
              <ConnectionTypeButton
                label={t('connectionAgent')}
                active={connectionType === 'none'}
                disabled={!isConnectionEnabled('none', sourceEdgeType)}
                onClick={() => {
                  setConnectionType('none');
                  setConnectionValue('');
                }}
              />
              <ConnectionTypeButton
                label={t('connectionUser')}
                active={connectionType === 'user_said'}
                disabled={!isConnectionEnabled('user_said', sourceEdgeType)}
                onClick={() => {
                  setConnectionType('user_said');
                  setConnectionValue('');
                }}
              />
              <ConnectionTypeButton
                label={t('connectionTool')}
                active={connectionType === 'tool_call'}
                disabled={!isConnectionEnabled('tool_call', sourceEdgeType)}
                onClick={() => {
                  setConnectionType('tool_call');
                  setConnectionValue('');
                }}
              />
            </div>
          </div>
          <ConnectionValueField
            connectionType={connectionType}
            value={connectionValue}
            onChange={setConnectionValue}
            servers={servers}
            discoveredTools={discoveredTools}
          />
          <div className="space-y-2">
            <Label className="text-xs">{t('continueLoop')}</Label>
            <Input
              value={continueValue}
              onChange={(e) => setContinueValue(e.target.value)}
              placeholder={t('continueLoopPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t('exitLoop')}</Label>
            <Input
              value={exitValue}
              onChange={(e) => setExitValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreate();
              }}
              placeholder={t('exitLoopPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate} className="active:scale-[0.97] transition-transform">
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionValueField({
  connectionType,
  value,
  onChange,
  servers,
  discoveredTools,
}: {
  connectionType: LoopConnectionType;
  value: string;
  onChange: (v: string) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}) {
  const t = useTranslations('connectionMenu');
  if (connectionType === 'none') return null;
  if (connectionType === 'tool_call') {
    return (
      <div className="space-y-2">
        <Label className="text-xs">{t('toolToCall')}</Label>
        <ToolCombobox
          value={value}
          onValueChange={onChange}
          servers={servers}
          discoveredTools={discoveredTools}
          placeholder={t('selectTool')}
        />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label className="text-xs">{t('whenUserSays')}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('userSaysPlaceholder')}
        className="h-8 text-xs"
      />
    </div>
  );
}

function resolveDefaultConnection(sourceEdgeType: ExistingEdgeType): LoopConnectionType {
  if (sourceEdgeType === 'user_said') return 'user_said';
  if (sourceEdgeType === 'tool_call') return 'tool_call';
  return 'none';
}

function isLoopFormValid(
  connectionType: LoopConnectionType,
  connectionValue: string,
  continueValue: string,
  exitValue: string
): boolean {
  if (continueValue.trim() === '' || exitValue.trim() === '') return false;
  if (connectionType === 'none') return true;
  return connectionValue.trim() !== '';
}
