'use client';

import type { TenantRow } from '@/app/lib/tenants';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Compass, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ChannelCell } from './ChannelCell';
import { ChannelHeaderIcon } from './ChannelHeaderIcon';
import { TenantAvatar } from './TenantAvatar';
import { CHANNELS } from './channelDefinitions';

interface ChannelsTableProps {
  tenants: TenantRow[];
  agentId: string;
}

function ApiToggleCell() {
  const [enabled, setEnabled] = useState(true);

  return <Switch size="sm" checked={enabled} onCheckedChange={() => setEnabled((v) => !v)} />;
}

function ApiHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <Globe className="size-3.5 text-primary" />
      <span>{label}</span>
    </div>
  );
}

function WebHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <Compass className="size-3.5 text-primary" />
      <span>{label}</span>
    </div>
  );
}

function WebToggleCell() {
  const [enabled, setEnabled] = useState(true);

  return <Switch size="sm" checked={enabled} onCheckedChange={() => setEnabled((v) => !v)} />;
}

export function ChannelsTable({ tenants, agentId }: ChannelsTableProps) {
  const t = useTranslations('editor.channels');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">{t('tenant')}</TableHead>
          <TableHead className="text-center">
            <ApiHeader label={t('api')} />
          </TableHead>
          <TableHead className="text-center">
            <WebHeader label={t('web')} />
          </TableHead>
          {CHANNELS.map((ch) => (
            <TableHead key={ch.key} className="text-center">
              <ChannelHeaderIcon channelKey={ch.key} label={t(ch.labelKey)} enabled={ch.enabled} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((tenant) => (
          <TableRow key={tenant.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <TenantAvatar name={tenant.name} avatarUrl={tenant.avatar_url} />
                <span className="truncate text-xs font-medium">{tenant.name}</span>
              </div>
            </TableCell>
            <TableCell className="text-center">
              <ApiToggleCell />
            </TableCell>
            <TableCell className="text-center">
              <WebToggleCell />
            </TableCell>
            {CHANNELS.map((ch) => (
              <TableCell key={ch.key} className="text-center">
                <ChannelCell tenantId={tenant.id} channelKey={ch.key} agentId={agentId} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
