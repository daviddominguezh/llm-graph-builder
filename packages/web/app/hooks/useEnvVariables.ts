import { useEffect, useState } from 'react';

import { getEnvVariablesByOrgAction } from '../actions/orgEnvVariables';
import type { OrgEnvVariableRow } from '../lib/orgEnvVariables';

export function useEnvVariables(orgId: string | undefined): OrgEnvVariableRow[] {
  const [envVariables, setEnvVariables] = useState<OrgEnvVariableRow[]>([]);

  useEffect(() => {
    if (orgId === undefined || orgId === '') return;
    void getEnvVariablesByOrgAction(orgId).then(({ result }) => {
      setEnvVariables(result);
    });
  }, [orgId]);

  return envVariables;
}
