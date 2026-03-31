'use client';

import { getTenantsByOrgAction } from '@/app/actions/tenants';
import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { CreateTenantDialog } from './CreateTenantDialog';
import { DeleteTenantDialog } from './DeleteTenantDialog';
import { EditTenantDialog } from './EditTenantDialog';

interface TenantsSectionProps {
  orgId: string;
  initialTenants: TenantRow[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TenantRowActions({
  tenant,
  onEdit,
  onDelete,
}: {
  tenant: TenantRow;
  onEdit: (t: TenantRow) => void;
  onDelete: (t: TenantRow) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" onClick={() => onEdit(tenant)}>
        <Pencil className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => onDelete(tenant)}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function TenantsTable({
  tenants,
  onEdit,
  onDelete,
}: {
  tenants: TenantRow[];
  onEdit: (t: TenantRow) => void;
  onDelete: (t: TenantRow) => void;
}) {
  const t = useTranslations('tenants');

  if (tenants.length === 0) {
    return <p className="text-muted-foreground text-xs bg-card py-2 px-3 rounded-md">{t('noTenants')}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('name')}</TableHead>
          <TableHead>{t('id')}</TableHead>
          <TableHead>{t('createdAt')}</TableHead>
          <TableHead className="text-right">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tenants.map((tenant) => (
          <TableRow key={tenant.id}>
            <TableCell className="font-medium">{tenant.name}</TableCell>
            <TableCell className="font-mono text-muted-foreground">{tenant.id}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(tenant.created_at)}</TableCell>
            <TableCell className="text-right">
              <TenantRowActions tenant={tenant} onEdit={onEdit} onDelete={onDelete} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TenantsSection({ orgId, initialTenants }: TenantsSectionProps) {
  const t = useTranslations('tenants');
  const [tenants, setTenants] = useState<TenantRow[]>(initialTenants);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TenantRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantRow | null>(null);

  const refreshTenants = useCallback(async () => {
    const { result } = await getTenantsByOrgAction(orgId);
    setTenants(result);
  }, [orgId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t('add')}
        </Button>
      </div>
      <TenantsTable tenants={tenants} onEdit={setEditTarget} onDelete={setDeleteTarget} />
      <CreateTenantDialog open={createOpen} onOpenChange={setCreateOpen} orgId={orgId} onCreated={refreshTenants} />
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
    </div>
  );
}
