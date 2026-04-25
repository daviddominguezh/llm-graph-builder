'use client';

import type { OutputSchemaEntity } from '@daviddh/graph-types';

import { OutputSchemasSection } from './OutputSchemasSection';

interface DataTabContentProps {
  agentId: string;
  schemas: OutputSchemaEntity[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  editFormHref?: (formId: string) => string;
}

export function DataTabContent(props: DataTabContentProps) {
  return (
    <OutputSchemasSection
      agentId={props.agentId}
      schemas={props.schemas}
      onAdd={props.onAdd}
      onRemove={props.onRemove}
      onEdit={props.onEdit}
      editFormHref={props.editFormHref}
    />
  );
}
