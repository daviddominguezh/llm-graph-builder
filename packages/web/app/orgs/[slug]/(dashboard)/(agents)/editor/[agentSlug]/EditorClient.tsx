'use client';

import type { ComponentType } from 'react';

import dynamic from 'next/dynamic';

import type { PublishTenant } from '@/app/components/panels/PublishButtonTenantPicker';
import type { ApiKeyRow } from '@/app/lib/apiKeys';

interface EditorClientProps {
  agentId: string;
  agentSlug: string;
  tenants: PublishTenant[];
  agentName: string;
  orgSlug: string;
  orgId: string;
  orgName: string;
  orgAvatarUrl: string | null;
  initialVersion: number;
  orgApiKeys: ApiKeyRow[];
  stagingApiKeyId: string | null;
  productionApiKeyId: string | null;
}

const GraphBuilder = dynamic<EditorClientProps>(
  () =>
    import('@/app/components/GraphBuilder').then(
      (mod) => mod.GraphBuilder as ComponentType<EditorClientProps>
    ),
  { ssr: false }
);

export function EditorClient(props: EditorClientProps): React.JSX.Element {
  return <GraphBuilder {...props} />;
}
