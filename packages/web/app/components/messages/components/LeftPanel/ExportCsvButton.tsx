'use client';

import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';

import type { AgentOption } from '../ChatListPanel/AgentFilterCombobox';
import { ExportCsvDialog } from '../ExportCsv/ExportCsvDialog';

interface Props {
  tenantId: string;
  tenantSlug: string;
  orgSlug: string;
  agents: AgentOption[];
  defaultAgentId: string | null;
}

export function ExportCsvButton(props: Props): ReactElement {
  const t = useTranslations('forms.export');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={(): void => setOpen(true)}
      >
        <Download className="size-3.5" />
        {t('button')}
      </Button>
      {open && <ExportCsvDialog open onClose={(): void => setOpen(false)} {...props} />}
    </>
  );
}
