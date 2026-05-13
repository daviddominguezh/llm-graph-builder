'use client';

import type { ReactElement } from 'react';

import type { OutputSchemaField } from '@daviddh/graph-types';
import type { ValidationsMap } from '@daviddh/llm-graph-runner';

import { FormDialogStaleValidations } from './FormDialogStaleValidations';
import { FormDialogValidationsEditor } from './FormDialogValidationsEditor';

interface Props {
  schema: OutputSchemaField[];
  validations: ValidationsMap;
  stalePaths: string[];
  staleKept: boolean;
  onKeepStale: () => void;
  onChange: (next: ValidationsMap) => void;
}

export function FormDialogStep2({
  schema,
  validations,
  stalePaths,
  staleKept,
  onKeepStale,
  onChange,
}: Props): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <FormDialogStaleValidations
        stalePaths={stalePaths}
        validations={validations}
        onChange={onChange}
        onKeep={onKeepStale}
        kept={staleKept}
      />
      <FormDialogValidationsEditor schema={schema} validations={validations} onChange={onChange} />
    </div>
  );
}
