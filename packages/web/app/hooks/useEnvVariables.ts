import { useEffect, useState } from 'react';

import { getEnvVariablesByOrgAction } from '../actions/org-env-variables';
import type { OrgEnvVariableRow } from '../lib/org-env-variables';

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
