'use client';

import { getTenantsByOrgAction } from '@/app/actions/tenants';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { CreateTenantDialog } from './CreateTenantDialog';
import { DeleteTenantDialog } from './DeleteTenantDialog';
import { EditTenantDialog } from './EditTenantDialog';

interface TenantsSectionProps {
  orgId: string;
  orgSlug: string;
  initialTenants: TenantRow[];
}

const COPY_FEEDBACK_MS = 1500;
const ID_PREFIX_LEN = 8;
const ID_SUFFIX_LEN = 4;

interface RelativeLabels {
  justNow: string;
  fmt: (key: string, values: Record<string, number>) => string;
}

function formatRelativeDate(iso: string, labels: RelativeLabels): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return labels.justNow;
  if (diffMin < 60) return labels.fmt('minutesAgo', { count: diffMin });
  if (diffHr < 24) return labels.fmt('hoursAgo', { count: diffHr });
  if (diffDay < 30) return labels.fmt('daysAgo', { count: diffDay });
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function TenantAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={24}
        height={24}
        className="size-6 shrink-0 rounded-full object-cover border border-input border-[1px]"
      />
    );
  }

  return (
    <div className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium border">
      {initial}
    </div>
  );
}

function CopyableId({ id }: { id: string }) {
  const t = useTranslations('tenants');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }

  const truncated = `${id.slice(0, ID_PREFIX_LEN)}\u2026${id.slice(-ID_SUFFIX_LEN)}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 font-mono text-muted-foreground cursor-pointer transition-colors hover:text-foreground"
            onClick={handleCopy}
          >
            <span className="mr-2">{truncated}</span>
            {copied ? (
              <Check className="size-3 text-emerald-500 check-pop" />
            ) : (
              <Copy className="size-3 opacity-0 transition-opacity group-hover/row:opacity-100" />
            )}
          </button>
        }
      />
      <TooltipContent side="top">{copied ? t('copied') : t('clickToCopy')}</TooltipContent>
    </Tooltip>
  );
}

function TenantRowActions({
  tenant,
  onEdit,
  onDelete,
}: {
  tenant: TenantRow;
  onEdit: (row: TenantRow) => void;
  onDelete: (row: TenantRow) => void;
}) {
  const t = useTranslations('tenants');

  return (
    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="p-0! h-7 aspect-square"
              onClick={() => onEdit(tenant)}
            />
          }
        >
          <Pencil className="size-3" />
        </TooltipTrigger>
        <TooltipContent side="top">{t('editTitle')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="destructive"
              size="icon"
              className="p-0! h-7 aspect-square"
              onClick={() => onDelete(tenant)}
            />
          }
        >
          <Trash2 className="size-3" />
        </TooltipTrigger>
        <TooltipContent side="top">{t('deleteTitle')}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations('tenants');

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center bg-background rounded-md border border-dashed">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Building2 className="size-5 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t('noTenants')}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t('emptyDescription')}</p>
      </div>
      <Button size="sm" className="rounded-full" onClick={onAdd}>
        <Plus className="size-3.5" />
        {t('add')}
      </Button>
    </div>
  );
}

function TenantsTable({
  tenants,
  newIds,
  orgSlug,
  onEdit,
  onDelete,
}: {
  tenants: TenantRow[];
  newIds: ReadonlySet<string>;
  orgSlug: string;
  onEdit: (row: TenantRow) => void;
  onDelete: (row: TenantRow) => void;
}) {
  const t = useTranslations('tenants');
  const dateLabels: RelativeLabels = { justNow: t('justNow'), fmt: (k, v) => t(k, v) };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('name')}</TableHead>
          <TableHead>{t('id')}</TableHead>
          <TableHead>{t('createdAt')}</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((tenant) => (
          <TableRow
            key={tenant.id}
            className={`group/row hover:bg-transparent ${newIds.has(tenant.id) ? 'row-enter' : ''}`}
          >
            <TableCell>
              <Link
                href={`/orgs/${orgSlug}/tenant/${tenant.slug}`}
                className="tenant-row-link inline-flex items-center gap-2 max-w-[200px] align-middle transition-colors"
              >
                <TenantAvatar name={tenant.name} avatarUrl={tenant.avatar_url} />
                <span className="tenant-row-name truncate font-medium leading-none">{tenant.name}</span>
              </Link>
            </TableCell>
            <TableCell>
              <CopyableId id={tenant.id} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatRelativeDate(tenant.created_at, dateLabels)}
            </TableCell>
            <TableCell className="text-right">
              <TenantRowActions tenant={tenant} onEdit={onEdit} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function useTenantsWithNewTracking(initialTenants: TenantRow[]) {
  const [tenants, setTenants] = useState<TenantRow[]>(initialTenants);
  const knownIdsRef = useRef<Set<string>>(new Set(initialTenants.map((r) => r.id)));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const updateTenants = useCallback((next: TenantRow[]) => {
    const fresh = new Set<string>();
    for (const row of next) {
      if (!knownIdsRef.current.has(row.id)) fresh.add(row.id);
    }
    knownIdsRef.current = new Set(next.map((r) => r.id));
    setNewIds(fresh);
    setTenants(next);
  }, []);

  return { tenants, newIds, updateTenants };
}

export function TenantsSection({ orgId, orgSlug, initialTenants }: TenantsSectionProps) {
  const t = useTranslations('tenants');
  const { tenants, newIds, updateTenants } = useTenantsWithNewTracking(initialTenants);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantRow | null>(null);

  const refreshTenants = useCallback(async () => {
    const { result } = await getTenantsByOrgAction(orgId);
    updateTenants(result);
  }, [orgId, updateTenants]);

  const count = tenants.length;

  return (
    <Card className="bg-background ring-0">
      <CardHeader>
        <CardTitle className="flex items-center">
          {t('title')}
          {count > 0 && <span className="ml-2 text-[10px] font-normal text-muted-foreground">{count}</span>}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            className="border-[0.5px] rounded-md"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            {t('add')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <EmptyState onAdd={() => setCreateOpen(true)} />
        ) : (
          <TenantsTable
            tenants={tenants}
            newIds={newIds}
            orgSlug={orgSlug}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
          />
        )}
      </CardContent>
      <CreateTenantDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={refreshTenants}
      />
      {editTarget !== null && (
        <EditTenantDialog
          open={editTarget !== null}
          onOpenChange={() => setEditTarget(null)}
          tenant={editTarget}
          onSaved={refreshTenants}
        />
      )}
      {deleteTarget !== null && (
        <DeleteTenantDialog
          open={deleteTarget !== null}
          onOpenChange={() => setDeleteTarget(null)}
          tenantId={deleteTarget.id}
          tenantName={deleteTarget.name}
          onDeleted={refreshTenants}
        />
      )}
    </Card>
  );
}
