'use client';

import { Scrollable } from '@/app/components/Scrollable';
import type { TenantRow } from '@/app/lib/tenants';
import { useRef, useState } from 'react';

import { KnowledgeBaseUploader } from './KnowledgeBaseUploader';
import { NoTenantsState } from './NoTenantsState';
import { TenantList } from './TenantList';
import { useFileQueue } from './useFileQueue';
import { useNativeDropArea } from './useNativeDropArea';

interface KnowledgeBaseClientProps {
  tenants: TenantRow[];
  defaultTenantId: string;
  orgSlug: string;
}

function panelClassName(isDragging: boolean): string {
  const base =
    'relative flex h-[calc(100%-var(--spacing)*2)] overflow-hidden border mr-2 rounded-xl bg-background transition duration-150';
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
  const hasTenants = tenants.length > 0;

  return (
    <div ref={containerRef} className={panelClassName(isDragging && hasTenants)}>
      {hasTenants ? (
        <>
          <TenantList tenants={tenants} currentTenantId={tenantId} onSelect={setTenantId} />
          <Scrollable className="min-h-0 flex-1">
            <div className="p-6">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                <KnowledgeBaseUploader queue={queue} isDragging={isDragging} />
              </div>
            </div>
          </Scrollable>
        </>
      ) : (
        <div className="flex flex-1 justify-center p-6">
          <NoTenantsState orgSlug={orgSlug} />
        </div>
      )}
    </div>
  );
}
