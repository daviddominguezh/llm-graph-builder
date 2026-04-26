'use client';

import { TenantPicker } from '@/app/components/agents/triggers/TenantPicker';
import { Scrollable } from '@/app/components/Scrollable';
import type { TenantRow } from '@/app/lib/tenants';
import { useRef, useState } from 'react';

import { KnowledgeBaseUploader } from './KnowledgeBaseUploader';
import { useFileQueue } from './useFileQueue';
import { useNativeDropArea } from './useNativeDropArea';

interface KnowledgeBaseClientProps {
  tenants: TenantRow[];
  defaultTenantId: string;
  orgSlug: string;
}

function panelClassName(isDragging: boolean): string {
  const base =
    'relative flex h-[calc(100%-var(--spacing)*2)] flex-col overflow-hidden border mr-2 rounded-xl bg-background transition duration-150';
  const drag = isDragging ? 'ring-2 ring-inset ring-primary/60' : '';
  return `${base} ${drag}`.trim();
}

export function KnowledgeBaseClient({
  tenants,
  defaultTenantId,
  orgSlug,
}: KnowledgeBaseClientProps): React.JSX.Element {
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const queue = useFileQueue();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useNativeDropArea(containerRef, queue.add);

  return (
    <div ref={containerRef} className={panelClassName(isDragging)}>
      <Scrollable className="min-h-0 flex-1">
        <div className="p-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <TenantPicker
              tenants={tenants}
              value={tenantId}
              onChange={setTenantId}
              loading={false}
              error={null}
              orgSlug={orgSlug}
            />
            <KnowledgeBaseUploader queue={queue} isDragging={isDragging} />
          </div>
        </div>
      </Scrollable>
    </div>
  );
}
