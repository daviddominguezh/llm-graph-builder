'use client';

import type { TenantRow } from '@/app/lib/tenants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface TenantPickerProps {
  tenants: TenantRow[];
  value: string;
  onChange: (next: string) => void;
  loading: boolean;
  error: string | null;
  orgSlug: string;
}

const STATUS_LINE = 'flex items-center gap-1.5 text-xs text-muted-foreground';

function LoadingRow({ label }: { label: string }) {
  return (
    <div className={STATUS_LINE}>
      <Loader2 className="size-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className={STATUS_LINE}>
      <span className="text-destructive">{message}</span>
    </div>
  );
}

function EmptyRow({ label, ctaLabel, href }: { label: string; ctaLabel: string; href: string }) {
  return (
    <div className={STATUS_LINE}>
      <span>{label}</span>
      <Link href={href} className="font-medium text-foreground underline-offset-2 hover:underline">
        {ctaLabel}
      </Link>
    </div>
  );
}

function TenantSelect({
  tenants,
  value,
  onChange,
  placeholder,
}: {
  tenants: TenantRow[];
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  const selected = tenants.find((t) => t.id === value);
  return (
    <Select value={value} onValueChange={(v) => typeof v === 'string' && v && onChange(v)}>
      <SelectTrigger>
        <SelectValue>{selected?.name ?? placeholder}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {tenants.map((tenant) => (
          <SelectItem key={tenant.id} value={tenant.id}>
            {tenant.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PickerBody(props: TenantPickerProps) {
  const t = useTranslations('editor.triggers.picker');
  if (props.loading) return <LoadingRow label={t('loading')} />;
  if (props.error !== null) return <ErrorRow message={t('error')} />;
  if (props.tenants.length === 0) {
    return (
      <EmptyRow label={t('emptyLabel')} ctaLabel={t('emptyCta')} href={`/orgs/${props.orgSlug}/tenants`} />
    );
  }
  return (
    <TenantSelect
      tenants={props.tenants}
      value={props.value}
      onChange={props.onChange}
      placeholder={t('placeholder')}
    />
  );
}

export function TenantPicker(props: TenantPickerProps) {
  const t = useTranslations('editor.triggers.picker');
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('label')}
      </span>
      <PickerBody {...props} />
    </div>
  );
}
