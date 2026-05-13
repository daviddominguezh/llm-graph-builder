'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ExportCsvAgentCombobox, type AgentOption } from './ExportCsvAgentCombobox';
import { ExportCsvDateRange } from './ExportCsvDateRange';
import { ExportCsvFormSelect } from './ExportCsvFormSelect';
import { ExportCsvMatchCount } from './ExportCsvMatchCount';
import { useCsvExport } from './useCsvExport';

interface Props {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantSlug: string;
  orgSlug: string;
  agents: AgentOption[];
  defaultAgentId: string | null;
}

const MAX_DAYS = 15;
const MS_PER_DAY = 86_400_000;

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - MAX_DAYS * MS_PER_DAY);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function ExportCsvDialog({
  open,
  onClose,
  tenantId,
  tenantSlug,
  orgSlug,
  agents,
  defaultAgentId,
}: Props): ReactElement {
  const t = useTranslations('forms.export');
  const [agentId, setAgentId] = useState<string | null>(defaultAgentId);
  const [formSlug, setFormSlug] = useState<string | null>(null);
  const [range, setRange] = useState(defaultRange);
  const [withData, setWithData] = useState<number | null>(null);
  const { state, run, abort } = useCsvExport();

  const rangeValid = isRangeValid(range.from, range.to);
  const canExport = isExportable({ agentId, formSlug, rangeValid, withData });

  const submit = async (): Promise<void> => {
    if (!canExport || agentId === null || formSlug === null) return;
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    const url = buildExportUrl({ agentId, formSlug, tenantId, tenantSlug, agentSlug: agent.slug, range });
    const filename = `openflow-${tenantSlug}-${agent.slug}-${formSlug}-${range.from}-${range.to}.csv`;
    await run(url, filename);
    onClose();
  };

  const handleOpenChange = (next: boolean): void => {
    if (next || state === 'generating') return;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dialog.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ExportCsvDateRange value={range} onChange={setRange} />
          <ExportCsvAgentCombobox agents={agents} value={agentId} onChange={setAgentId} />
          <ExportCsvFormSelect agentId={agentId} value={formSlug} onChange={setFormSlug} />
          <ExportCsvMatchCount
            agentId={agentId}
            formSlug={formSlug}
            tenantId={tenantId}
            from={range.from}
            to={range.to}
            orgSlug={orgSlug}
            onCountChange={(n) => setWithData(n)}
          />
        </div>
        <DialogFooter>
          <DialogActions
            state={state}
            canExport={canExport}
            onCancel={onClose}
            onAbort={abort}
            onSubmit={submit}
            t={t}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ActionsProps {
  state: 'idle' | 'generating';
  canExport: boolean;
  onCancel: () => void;
  onAbort: () => void;
  onSubmit: () => void;
  t: ReturnType<typeof useTranslations>;
}

function DialogActions({ state, canExport, onCancel, onAbort, onSubmit, t }: ActionsProps): ReactElement {
  return (
    <>
      {state === 'generating' ? (
        <Button variant="outline" onClick={onAbort}>
          {t('abort')}
        </Button>
      ) : (
        <Button variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      )}
      <Button onClick={onSubmit} disabled={!canExport || state === 'generating'}>
        {state === 'generating' ? t('generating') : t('export')}
      </Button>
    </>
  );
}

function isRangeValid(from: string, to: string): boolean {
  const delta = (Date.parse(to) - Date.parse(from)) / MS_PER_DAY;
  return delta >= 0 && delta <= MAX_DAYS;
}

interface ExportableArgs {
  agentId: string | null;
  formSlug: string | null;
  rangeValid: boolean;
  withData: number | null;
}

function isExportable({ agentId, formSlug, rangeValid, withData }: ExportableArgs): boolean {
  return agentId !== null && formSlug !== null && rangeValid && withData !== null && withData > 0;
}

interface UrlArgs {
  agentId: string;
  formSlug: string;
  tenantId: string;
  tenantSlug: string;
  agentSlug: string;
  range: { from: string; to: string };
}

function buildExportUrl(a: UrlArgs): string {
  const params = new URLSearchParams({
    tenantId: a.tenantId,
    tenantSlug: a.tenantSlug,
    agentSlug: a.agentSlug,
    from: a.range.from,
    to: a.range.to,
  });
  return `/api/agents/${a.agentId}/forms/${a.formSlug}/export?${params.toString()}`;
}
