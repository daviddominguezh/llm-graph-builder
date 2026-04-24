'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';

import { OutputSchemasSection } from './OutputSchemasSection';

interface DataTabContentProps {
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

export function DataTabContent(props: DataTabContentProps) {
  return (
    <OutputSchemasSection
      schemas={props.schemas}
      onAdd={props.onAdd}
      onRemove={props.onRemove}
      onEdit={props.onEdit}
    />
  );
}
