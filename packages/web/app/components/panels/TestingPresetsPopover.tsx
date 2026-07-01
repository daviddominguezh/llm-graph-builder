'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import type { ContextPreset } from '../../types/preset';
import { type PublishTenant, TenantPicker } from './PublishButtonTenantPicker';
import { TenantSwitchResetDialog } from './TenantSwitchResetDialog';
import { TestingPresetsSection } from './TestingPresetsSection';

interface TestingPresetsPopoverProps {
  presets: ContextPreset[];
  contextKeys: string[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
  tenants: PublishTenant[];
  selectedTenantId: string;
  onTenantChange: (tenantId: string) => void;
  // True when there is simulation state or messages that a tenant switch would discard.
  requiresResetConfirm: boolean;
  onResetSimulation: () => void;
}

interface TenantSwitch {
  open: boolean;
  request: (next: string) => void;
  confirm: () => void;
  cancel: () => void;
}

// A tenant change while sim state / messages exist must first confirm a reset (RU3 §8).
function useTenantSwitch(
  requiresResetConfirm: boolean,
  onTenantChange: (id: string) => void,
  onResetSimulation: () => void
): TenantSwitch {
  const [pending, setPending] = useState<string | null>(null);
  const request = useCallback(
    (next: string) => {
      if (requiresResetConfirm) setPending(next);
      else onTenantChange(next);
    },
    [requiresResetConfirm, onTenantChange]
  );
  const confirm = useCallback(() => {
    if (pending !== null) {
      onResetSimulation();
      onTenantChange(pending);
    }
    setPending(null);
  }, [pending, onResetSimulation, onTenantChange]);
  const cancel = useCallback(() => setPending(null), []);
  return { open: pending !== null, request, confirm, cancel };
}

export function TestingPresetsPopover(props: TestingPresetsPopoverProps): React.JSX.Element {
  const t = useTranslations('simulation');
  const { tenants, selectedTenantId, onTenantChange, requiresResetConfirm, onResetSimulation } = props;
  const tenantSwitch = useTenantSwitch(requiresResetConfirm, onTenantChange, onResetSimulation);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-1.5">
            <SlidersHorizontal className="size-3.5" />
            {t('toolbar.testingPresetsLabel')}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96">
        <div data-native-scroll className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          <TenantPicker
            tenants={tenants}
            selectedTenantId={selectedTenantId}
            onChange={tenantSwitch.request}
          />
          <TestingPresetsSection
            presets={props.presets}
            contextKeys={props.contextKeys}
            onAdd={props.onAdd}
            onDelete={props.onDelete}
            onUpdate={props.onUpdate}
          />
        </div>
      </PopoverContent>
      <TenantSwitchResetDialog
        open={tenantSwitch.open}
        onOpenChange={(open) => {
          if (!open) tenantSwitch.cancel();
        }}
        onConfirm={tenantSwitch.confirm}
      />
    </Popover>
  );
}
