'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  onCreate: (connection: { type: LoopConnectionType; value: string }, continueValue: string, exitValue: string) => void;
  servers: McpServerConfig[];
  discoveredTools: Record<string, DiscoveredTool[]>;
}

const CONNECTION_COLOR_MAP = {
  none: 'muted',
  user_said: 'green',
  tool_call: 'orange',
} as const;

function isConnectionEnabled(
  connType: LoopConnectionType,
  sourceEdgeType: ExistingEdgeType
): boolean {
  if (sourceEdgeType === 'unset') return true;
  return connType === sourceEdgeType;
}

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
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'bg-muted text-muted-foreground hover:bg-accent'
      } disabled:opacity-40 disabled:pointer-events-none`}
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createLoop')}</DialogTitle>
        </DialogHeader>
        <LoopPreview sourceLabel={sourceNodeLabel} connectionColor={CONNECTION_COLOR_MAP[connectionType]} />
        <div className="space-y-4 px-1">
          <div className="space-y-2">
            <Label className="text-xs">{t('connectionType')}</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <ConnectionTypeButton
                label={t('connectionAgent')}
                active={connectionType === 'none'}
                disabled={!isConnectionEnabled('none', sourceEdgeType)}
                onClick={() => { setConnectionType('none'); setConnectionValue(''); }}
              />
              <ConnectionTypeButton
                label={t('connectionUser')}
                active={connectionType === 'user_said'}
                disabled={!isConnectionEnabled('user_said', sourceEdgeType)}
                onClick={() => { setConnectionType('user_said'); setConnectionValue(''); }}
              />
              <ConnectionTypeButton
                label={t('connectionTool')}
                active={connectionType === 'tool_call'}
                disabled={!isConnectionEnabled('tool_call', sourceEdgeType)}
                onClick={() => { setConnectionType('tool_call'); setConnectionValue(''); }}
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
              onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder={t('exitLoopPlaceholder')}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCancel}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
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
