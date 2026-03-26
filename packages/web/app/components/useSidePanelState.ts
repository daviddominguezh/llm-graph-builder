import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { installMcpAction } from '../actions/mcpLibrary';
import type { UseGraphSelectionReturn } from '../hooks/useGraphSelection';
import type { McpServersState } from '../hooks/useMcpServers';
import type { OutputSchemasState } from '../hooks/useOutputSchemas';
import type { McpLibraryRow } from '../lib/mcpLibraryTypes';
import type { McpServerConfig } from '../schemas/graph.schema';
import type { NodeSetter } from './sidePanelHelpers';
import { buildLibraryConfig } from './sidePanelMcpHelpers';

export interface SchemaDialogState {
  editingSchemaId: string | null;
  editingSchema: OutputSchemasState['schemas'][number] | undefined;
  handleEditSchema: (id: string) => void;
  handleEditNewSchema: (id: string) => void;
  handleRemoveSchema: (id: string) => void;
  handleSchemaSaved: (id: string) => void;
  handleSchemaDialogClose: () => void;
  pendingNewSchemaId: string | null;
}

interface SchemaDialogOptions {
  outputSchemasHook: OutputSchemasState;
  selection: UseGraphSelectionReturn;
  setNodes: NodeSetter;
}

export function useSchemaDialogState(options: SchemaDialogOptions): SchemaDialogState {
  const { outputSchemasHook, selection, setNodes } = options;
  const [editingSchemaId, setEditingSchemaId] = useState<string | null>(null);
  const [pendingNewSchemaId, setPendingNewSchemaId] = useState<string | null>(null);
  const savedRef = useRef(false);

  const editingSchema =
    editingSchemaId !== null ? outputSchemasHook.schemas.find((s) => s.id === editingSchemaId) : undefined;

  const handleEditSchema = useCallback((id: string) => {
    setEditingSchemaId(id);
  }, []);

  const handleEditNewSchema = useCallback((id: string) => {
    setPendingNewSchemaId(id);
    setEditingSchemaId(id);
  }, []);

  const handleRemoveSchema = useCallback(
    (id: string) => {
      outputSchemasHook.removeSchema(id);
      setNodes((nds) =>
        nds.map((n) =>
          n.data.outputSchemaId === id ? { ...n, data: { ...n.data, outputSchemaId: undefined } } : n
        )
      );
    },
    [outputSchemasHook, setNodes]
  );

  const handleSchemaSaved = useCallback(
    (id: string) => {
      savedRef.current = true;
      setPendingNewSchemaId(null);
      const nodeId = selection.selectedNodeId;
      if (nodeId === null) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId && !n.data.outputSchemaId ? { ...n, data: { ...n.data, outputSchemaId: id } } : n
        )
      );
    },
    [selection.selectedNodeId, setNodes]
  );

  const handleSchemaDialogClose = useCallback(() => {
    if (pendingNewSchemaId !== null && !savedRef.current) {
      outputSchemasHook.removeSchema(pendingNewSchemaId);
    }
    setPendingNewSchemaId(null);
    savedRef.current = false;
    setEditingSchemaId(null);
  }, [pendingNewSchemaId, outputSchemasHook]);

  return {
    editingSchemaId,
    editingSchema,
    handleEditSchema,
    handleEditNewSchema,
    handleRemoveSchema,
    handleSchemaSaved,
    handleSchemaDialogClose,
    pendingNewSchemaId,
  };
}

export interface PublishState {
  publishServer: McpServerConfig | null;
  setPublishServer: (server: McpServerConfig | null) => void;
  handleInstallFromLibrary: (item: McpLibraryRow) => void;
}

export function usePublishState(mcpHook: McpServersState): PublishState {
  const [publishServer, setPublishServer] = useState<McpServerConfig | null>(null);
  const t = useTranslations('mcpLibrary');

  const handleInstallFromLibrary = useCallback(
    (item: McpLibraryRow) => {
      void installMcpAction(item.id).then(({ error }) => {
        if (error !== null) {
          toast.error(t('installError'));
          return;
        }
        mcpHook.addServerFromLibrary(buildLibraryConfig(item));
        toast.success(t('installSuccess'));
      });
    },
    [mcpHook, t]
  );

  return { publishServer, setPublishServer, handleInstallFromLibrary };
}
