'use client';

import type { ComponentType } from 'react';

import dynamic from 'next/dynamic';

import type { ApiKeyRow } from '@/app/lib/api-keys';
import type { Graph } from '@/app/schemas/graph.schema';

interface EditorClientProps {
  agentId: string;
  agentName: string;
  initialGraphData: Graph;
  initialProductionData: Graph;
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

export function EditorClient({
  agentId,
  agentName,
  initialGraphData,
  initialProductionData,
  initialVersion,
  orgApiKeys,
  stagingApiKeyId,
  productionApiKeyId,
}: EditorClientProps): React.JSX.Element {
  return (
    <GraphBuilder
      agentId={agentId}
      agentName={agentName}
      initialGraphData={initialGraphData}
      initialProductionData={initialProductionData}
      initialVersion={initialVersion}
      orgApiKeys={orgApiKeys}
      stagingApiKeyId={stagingApiKeyId}
      productionApiKeyId={productionApiKeyId}
    />
  );
}
