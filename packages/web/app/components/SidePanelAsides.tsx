'use client';

import type { McpLibraryRow } from '../lib/mcp-library-types';
import type { McpServerConfig } from '../schemas/graph.schema';

import { McpLibraryPanel } from './panels/McpLibraryPanel';
import { PresetsPanel } from './panels/PresetsPanel';
import { PublishMcpDialog } from './panels/PublishMcpDialog';
import {
  createPrecondition,
  handlePreconditionRemove,
  handlePreconditionUpdate,
} from './sidePanelHelpers';
import type { SidePanelsProps } from './SidePanels';

type PresetsAsideProps = Pick<
  SidePanelsProps,
  | 'presetsHook'
  | 'ctxPreconditions'
  | 'setEdges'
  | 'orgApiKeys'
  | 'stagingKeyId'
  | 'productionKeyId'
  | 'onStagingKeyChange'
  | 'outputSchemasHook'
  | 'agentId'
  | 'agentName'
  | 'orgSlug'
> & {
  onEditSchema: (id: string) => void;
  onEditNewSchema: (id: string) => void;
  onRemoveSchema: (id: string) => void;
};

export function PresetsAside(props: PresetsAsideProps) {
  const { presetsHook, ctxPreconditions, setEdges } = props;

  return (
    <aside className="absolute left-0 top-0 bottom-0 w-80 border rounded-xl border-gray-200 bg-white z-10">
      <PresetsPanel
        presets={presetsHook.presets}
        contextKeys={presetsHook.contextKeys}
        orgApiKeys={props.orgApiKeys}
        stagingKeyId={props.stagingKeyId}
        productionKeyId={props.productionKeyId}
        onStagingKeyChange={props.onStagingKeyChange}
        agentId={props.agentId}
        agentName={props.agentName}
        orgSlug={props.orgSlug}
        onAdd={presetsHook.addPreset}
        onDelete={presetsHook.deletePreset}
        onUpdate={presetsHook.updatePreset}
        context={{
          keys: presetsHook.contextKeys,
          onAdd: presetsHook.addContextKey,
          onRemove: presetsHook.removeContextKey,
          onRename: presetsHook.renameContextKey,
        }}
        contextPreconditions={{
          preconditions: ctxPreconditions.customContextPreconditions,
          onAdd: () => createPrecondition(ctxPreconditions),
          onRemove: (id) => handlePreconditionRemove(id, ctxPreconditions, setEdges),
          onUpdate: (id, updates) => handlePreconditionUpdate(id, updates, ctxPreconditions, setEdges),
        }}
        outputSchemas={{
          schemas: props.outputSchemasHook.schemas,
          onAdd: () => {
            const id = props.outputSchemasHook.addSchema();
            props.onEditNewSchema(id);
          },
          onRemove: props.onRemoveSchema,
          onEdit: props.onEditSchema,
        }}
      />
    </aside>
  );
}

export interface McpDialogsProps {
  publishServer: McpServerConfig | null;
  orgId: string;
  onPublishClose: () => void;
  onPublished: () => void;
  libraryOpen: boolean;
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
  onCloseLibrary: () => void;
}

export function McpDialogs(props: McpDialogsProps) {
  return (
    <>
      {props.publishServer !== null && (
        <PublishMcpDialog
          server={props.publishServer}
          orgId={props.orgId}
          open
          onOpenChange={(open) => {
            if (!open) props.onPublishClose();
          }}
          onPublished={props.onPublished}
        />
      )}
      {props.libraryOpen && (
        <McpLibraryPanel
          installedLibraryIds={props.installedLibraryIds}
          onInstall={props.onInstall}
          onClose={props.onCloseLibrary}
        />
      )}
    </>
  );
}
