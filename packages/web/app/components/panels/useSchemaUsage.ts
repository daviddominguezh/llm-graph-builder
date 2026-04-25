'use client';

import { useEffect, useState } from 'react';

import { listSchemasUsingFormsAction } from '@/app/actions/forms';

interface FormRef {
  id: string;
  slug: string;
}

export function useSchemaUsageBySchemaId(agentId: string, schemaId: string): FormRef[] {
  const [forms, setForms] = useState<FormRef[]>([]);
  useEffect(() => {
    let cancelled = false;
    listSchemasUsingFormsAction(agentId)
      .then((map) => {
        if (!cancelled) setForms(map[schemaId] ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentId, schemaId]);
  return forms;
}

export function useSchemaUsageMap(agentId: string): Record<string, FormRef[]> {
  const [map, setMap] = useState<Record<string, FormRef[]>>({});
  useEffect(() => {
    let cancelled = false;
    listSchemasUsingFormsAction(agentId)
      .then((data) => {
        if (!cancelled) setMap(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [agentId]);
  return map;
}
