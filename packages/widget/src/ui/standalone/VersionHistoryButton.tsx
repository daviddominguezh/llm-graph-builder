import { History } from 'lucide-react';

import { useAgent } from '../../app/agentContext.js';
import { useT } from '../../app/i18nContext.js';
import { Button } from '../primitives/button.js';

export function VersionHistoryButton() {
  const t = useT();
  const { version } = useAgent();

  return (
    <Button variant="ghost" size="sm" aria-label={t('versionHistory')}>
      <History />
      <span>v{String(version)}</span>
    </Button>
  );
}
