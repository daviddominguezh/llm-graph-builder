'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export interface PublishTenant {
  id: string;
  slug: string;
  name: string;
}

interface TenantPickerProps {
  tenants: PublishTenant[];
  selectedTenantId: string;
  onChange: (tenantId: string) => void;
  disabled?: boolean;
}

export function TenantPicker({ tenants, selectedTenantId, onChange, disabled = false }: TenantPickerProps) {
  const t = useTranslations('editor');
  const selected = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium">{t('tenant')}</span>
      <Select
        value={selected?.id ?? ''}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{selected?.name ?? ''}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {tenants.map((tenant) => (
            <SelectItem key={tenant.id} value={tenant.id}>
              {tenant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface EmptyTenantsStateProps {
  orgSlug: string;
}

export function EmptyTenantsState({ orgSlug }: EmptyTenantsStateProps) {
  const t = useTranslations('editor');

  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-4 py-5 text-center">
      <Building2 className="size-5 text-muted-foreground" strokeWidth={1.5} />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t('noTenantsTitle')}</span>
        <span className="text-xs text-muted-foreground">{t('noTenantsDescription')}</span>
      </div>
      <Button variant="default" size="sm" className="gap-1.5" render={<Link href={`/orgs/${orgSlug}/tenants`} />}>
        {t('goToTenants')}
        <ArrowRight className="size-3.5" />
      </Button>
    </div>
  );
}
