'use client';

import type { ApiKeyRow } from '../../lib/apiKeys';
import type { ContextPrecondition } from '../../types/contextPrecondition';
import type { ContextPreset } from '../../types/preset';
import { ApiKeySelectSection } from './ApiKeySelectSection';
import { ContextKeysSection } from './ContextKeysSection';
import { ContextPreconditionsSection } from './ContextPreconditionsSection';
import { TestingPresetsSection } from './TestingPresetsSection';

interface ContextKeysProps {
  keys: string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onRename: (oldKey: string, newKey: string) => void;
}

interface ContextPreconditionsProps {
  preconditions: ContextPrecondition[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPrecondition>) => void;
}

interface TestingPresetsProps {
  presets: ContextPreset[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ContextPreset>) => void;
}

export interface SettingsTabContentProps {
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  productionKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
  onProductionKeyChange: (keyId: string | null) => void;
  showWorkflowSections: boolean;
  contextKeys: string[];
  context: ContextKeysProps;
  contextPreconditions: ContextPreconditionsProps;
  testingPresets: TestingPresetsProps;
}

export function SettingsTabContent(props: SettingsTabContentProps) {
  return (
    <div className="flex flex-col">
      <ApiKeySelectSection
        orgApiKeys={props.orgApiKeys}
        stagingKeyId={props.stagingKeyId}
        productionKeyId={props.productionKeyId}
        onStagingKeyChange={props.onStagingKeyChange}
        onProductionKeyChange={props.onProductionKeyChange}
      />
      {props.showWorkflowSections && (
        <>
          <ContextKeysSection
            keys={props.context.keys}
            onAdd={props.context.onAdd}
            onRemove={props.context.onRemove}
            onRename={props.context.onRename}
          />
          <ContextPreconditionsSection
            preconditions={props.contextPreconditions.preconditions}
            contextKeys={props.contextKeys}
            onAdd={props.contextPreconditions.onAdd}
            onRemove={props.contextPreconditions.onRemove}
            onUpdate={props.contextPreconditions.onUpdate}
          />
          <TestingPresetsSection
            presets={props.testingPresets.presets}
            contextKeys={props.contextKeys}
            onAdd={props.testingPresets.onAdd}
            onDelete={props.testingPresets.onDelete}
            onUpdate={props.testingPresets.onUpdate}
          />
        </>
      )}
    </div>
  );
}
