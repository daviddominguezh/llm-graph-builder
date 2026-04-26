'use client';

import { TenantSwitcher } from '@/app/components/messages/components/TenantSwitcher';
import type { TenantRow } from '@/app/lib/tenants';
import { useRef, useState } from 'react';

import { KnowledgeBaseUploader } from './KnowledgeBaseUploader';
import { useFileQueue } from './useFileQueue';
import { useNativeDropArea } from './useNativeDropArea';

interface KnowledgeBaseClientProps {
  tenants: TenantRow[];
  defaultTenantId: string;
}

interface TenantContextRowProps {
  tenants: TenantRow[];
  currentTenantId: string;
  onChange: (id: string) => void;
}

function TenantContextRow({
  tenants,
  currentTenantId,
  onChange,
}: TenantContextRowProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60 shrink-0">
        tenant
      </span>
      <div className="w-56 max-w-full">
        <TenantSwitcher
          tenants={tenants}
          currentTenantId={currentTenantId}
          onTenantChange={onChange}
        />
      </div>
    </div>
  );
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
}: KnowledgeBaseClientProps): React.JSX.Element {
  const [tenantId, setTenantId] = useState(defaultTenantId);
  const queue = useFileQueue();
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useNativeDropArea(containerRef, queue.add);

  return (
    <div ref={containerRef} className={panelClassName(isDragging)}>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <TenantContextRow tenants={tenants} currentTenantId={tenantId} onChange={setTenantId} />
          <KnowledgeBaseUploader queue={queue} isDragging={isDragging} />
        </div>
      </div>
    </div>
  );
}
