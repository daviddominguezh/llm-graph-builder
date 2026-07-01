'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Braces } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { SimulationStatePanel } from '../SimulationStatePanel';

interface SimulationStateButtonProps {
  state: Record<string, unknown>;
  onReset: () => void;
}

// Toolbar entry point for the T19 sim-state UI (RU3 §8): opens the read-only,
// runtime-authoritative state panel with its reset dialog.
export function SimulationStateButton({ state, onReset }: SimulationStateButtonProps): React.JSX.Element {
  const t = useTranslations('simulation');
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-full"
            aria-label={t('toolbar.simulationStateLabel')}
            title={t('toolbar.openPanel')}
          >
            <Braces />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <SimulationStatePanel state={state} onReset={onReset} />
      </PopoverContent>
    </Popover>
  );
}
