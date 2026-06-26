'use client';

import type { ReactElement } from 'react';

import type { OutputSchemaEntity } from '@daviddh/graph-types';

import { FormDialogNameSlug } from './FormDialogNameSlug';
import { FormDialogSchemaPicker } from './FormDialogSchemaPicker';

interface State {
  name: string;
  slug: string;
  schemaId: string | null;
  isNameSlugValid: boolean;
}

interface Props {
  agentId: string;
  schemas: OutputSchemaEntity[];
  state: State;
  onChange: (next: State) => void;
  disabled?: boolean;
}

export function FormDialogStep1({
  agentId,
  schemas,
  state,
  onChange,
  disabled,
}: Props): ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <FormDialogNameSlug
        agentId={agentId}
        disabled={disabled}
        value={{ name: state.name, slug: state.slug }}
        onChange={(v) => onChange({ ...state, name: v.name, slug: v.slug, isNameSlugValid: v.isValid })}
      />
      <FormDialogSchemaPicker
        schemas={schemas}
        value={state.schemaId}
        disabled={disabled}
        onChange={(id) => onChange({ ...state, schemaId: id })}
      />
    </div>
  );
}
