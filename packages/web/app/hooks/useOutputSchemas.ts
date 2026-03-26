import type { Operation, OutputSchemaEntity } from '@daviddh/graph-types';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

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

export interface UseOutputSchemasOptions {
  initialSchemas: OutputSchemaEntity[] | undefined;
  pushOperation: PushOperation;
}

export function useOutputSchemas(options: UseOutputSchemasOptions): OutputSchemasState {
  const { initialSchemas, pushOperation } = options;
  const [schemas, setSchemas] = useState<OutputSchemaEntity[]>(initialSchemas ?? []);

  const addSchema = useCallback((): string => {
    const schema = createDefaultSchema();
    setSchemas((prev) => [...prev, schema]);
    pushOperation(buildInsertOp(schema));
    return schema.id;
  }, [pushOperation]);

  const removeSchema = useCallback(
    (id: string) => {
      setSchemas((prev) => prev.filter((s) => s.id !== id));
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
          pushOperation(buildUpdateOp(merged));
        }
        return updated;
      });
    },
    [pushOperation]
  );

  return { schemas, addSchema, removeSchema, updateSchema, setSchemas };
}
