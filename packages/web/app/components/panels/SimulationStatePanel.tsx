'use client';

import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { JsonBlock } from './JsonDisplay';
import { ResetSimulationDialog } from './ResetSimulationDialog';

interface SimulationStatePanelProps {
  state: Record<string, unknown>;
  onReset: () => void;
}

// Read-only view of the runtime-authoritative simulation state (RU3 §6/§8).
export function SimulationStatePanel({ state, onReset }: SimulationStatePanelProps): React.JSX.Element {
  const t = useTranslations('simulation');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isEmpty = Object.keys(state).length === 0;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium">{t('toolbar.simulationStateLabel')}</span>
      {isEmpty ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          {t('statePanel.empty')}
        </p>
      ) : (
        <JsonBlock value={state} />
      )}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          disabled={isEmpty}
          onClick={() => setConfirmOpen(true)}
        >
          <RotateCcw className="size-3.5" />
          {t('statePanel.resetButton')}
        </Button>
      </div>
      <ResetSimulationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          onReset();
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}
