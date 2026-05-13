'use client';

import type { McpLibraryState } from '../hooks/useMcpLibrary';
import type { McpLibraryRow } from '../lib/mcpLibraryTypes';
import type { McpServerConfig } from '../schemas/graph.schema';

import { McpLibraryPanel } from './panels/McpLibraryPanel';
import { PublishMcpDialog } from './panels/PublishMcpDialog';

export interface McpDialogsProps {
  publishServer: McpServerConfig | null;
  orgId: string;
  onPublishClose: () => void;
  onPublished: () => void;
  libraryOpen: boolean;
  mcpLibrary: McpLibraryState;
  installedLibraryIds: string[];
  onInstall: (item: McpLibraryRow) => void;
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
          library={props.mcpLibrary}
          installedLibraryIds={props.installedLibraryIds}
          onInstall={props.onInstall}
        />
      )}
    </>
  );
}
