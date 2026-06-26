import type { Operation, OutputSchemaEntity } from '@daviddh/graph-types';
import { nanoid } from 'nanoid';
import { useCallback, useRef, useState } from 'react';

import type { PushOperation } from '../utils/operationBuilders';

const NAME_SLICE_END = 4;

export interface OutputSchemasState {
  schemas: OutputSchemaEntity[];
  addSchema: () => string;
  removeSchema: (id: string) => void;
  updateSchema: (id: string, updates: Partial<OutputSchemaEntity>) => void;
  setSchemas: (schemas: OutputSchemaEntity[]) => void;
}

function createDefaultSchema(): OutputSchemaEntity {
  const id = nanoid();
  return { id, name: `schema_${id.slice(0, NAME_SLICE_END)}`, fields: [] };
}

function buildInsertOp(schema: OutputSchemaEntity): Operation {
  return {
    type: 'insertOutputSchema',
    data: { schemaId: schema.id, name: schema.name, fields: schema.fields },
  };
}

function buildUpdateOp(schema: OutputSchemaEntity): Operation {
  return {
    type: 'updateOutputSchema',
    data: { schemaId: schema.id, name: schema.name, fields: schema.fields },
  };
}

function buildDeleteOp(id: string): Operation {
  return { type: 'deleteOutputSchema', schemaId: id };
}

/**
 * A schema that has been added to local state but never persisted is a "draft":
 * its first save must be an insert, and discarding it must not emit a delete op
 * (the backend never heard about it). Mutating `draftIds` here is safe because
 * `reactStrictMode` is off, so the `setSchemas` updater runs exactly once.
 */
function persistOpForSchema(schema: OutputSchemaEntity, draftIds: Set<string>): Operation {
  if (draftIds.has(schema.id)) {
    draftIds.delete(schema.id);
    return buildInsertOp(schema);
  }
  return buildUpdateOp(schema);
}

export interface UseOutputSchemasOptions {
  initialSchemas: OutputSchemaEntity[] | undefined;
  pushOperation: PushOperation;
}

export function useOutputSchemas(options: UseOutputSchemasOptions): OutputSchemasState {
  const { initialSchemas, pushOperation } = options;
  const [schemas, setSchemas] = useState<OutputSchemaEntity[]>(initialSchemas ?? []);
  const draftIdsRef = useRef<Set<string>>(new Set());

  const addSchema = useCallback((): string => {
    const schema = createDefaultSchema();
    setSchemas((prev) => [...prev, schema]);
    // Track as an unpersisted draft; the insert op is deferred until the first
    // save so that creating then cancelling never touches the backend.
    draftIdsRef.current.add(schema.id);
    return schema.id;
  }, []);

  const removeSchema = useCallback(
    (id: string) => {
      setSchemas((prev) => prev.filter((s) => s.id !== id));
      if (draftIdsRef.current.has(id)) {
        draftIdsRef.current.delete(id);
        return;
      }
      pushOperation(buildDeleteOp(id));
    },
    [pushOperation]
  );

  const updateSchema = useCallback(
    (id: string, updates: Partial<OutputSchemaEntity>) => {
      setSchemas((prev) => {
        const updated = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
        const merged = updated.find((s) => s.id === id);
        if (merged !== undefined) {
          pushOperation(persistOpForSchema(merged, draftIdsRef.current));
        }
        return updated;
      });
    },
    [pushOperation]
  );

  return { schemas, addSchema, removeSchema, updateSchema, setSchemas };
}
