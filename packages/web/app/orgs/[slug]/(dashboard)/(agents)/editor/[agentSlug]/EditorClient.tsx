'use client';

import type { ComponentType } from 'react';

import dynamic from 'next/dynamic';

import type { ApiKeyRow } from '@/app/lib/api-keys';

interface EditorClientProps {
  agentId: string;
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
