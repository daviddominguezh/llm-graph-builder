'use client';

import type { TenantRow } from '@/app/lib/tenants';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

function EditTenantButton({ tenant, onEdit }: { tenant: TenantRow; onEdit: (row: TenantRow) => void }) {
  const t = useTranslations('tenants');

  return (
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
  );
}

function DeleteTenantButton({ tenant, onDelete }: { tenant: TenantRow; onDelete: (row: TenantRow) => void }) {
  const t = useTranslations('tenants');

  return (
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
  );
}

// The default tenant's identity mirrors the org and it cannot be deleted (DB +
// backend enforce both), so its row exposes no edit or delete actions.
export function TenantRowActions({
  tenant,
  onEdit,
  onDelete,
}: {
  tenant: TenantRow;
  onEdit: (row: TenantRow) => void;
  onDelete: (row: TenantRow) => void;
}) {
  if (tenant.is_default) return null;

  return (
    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
      <EditTenantButton tenant={tenant} onEdit={onEdit} />
      <DeleteTenantButton tenant={tenant} onDelete={onDelete} />
    </div>
  );
}
