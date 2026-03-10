'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';

import type { ApiKeyRow } from '../../lib/api-keys';

export interface ApiKeySelectProps {
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  productionKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
}

function StagingKeySelect({
  orgApiKeys,
  stagingKeyId,
  onStagingKeyChange,
}: {
  orgApiKeys: ApiKeyRow[];
  stagingKeyId: string | null;
  onStagingKeyChange: (keyId: string | null) => void;
}) {
  const t = useTranslations('apiKeys');

  const items = [
    { value: '', label: t('none') },
    ...orgApiKeys.map((key) => ({ value: key.id, label: key.name })),
  ];

  return (
    <div className="space-y-1">
      <Label>{t('stagingKey')}</Label>
      <Select value={stagingKeyId ?? ''} items={items} onValueChange={(val) => onStagingKeyChange(val === '' ? null : val)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('selectKey')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{t('none')}</SelectItem>
          {orgApiKeys.map((key) => (
            <SelectItem key={key.id} value={key.id}>
              {key.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ProductionKeyDisplay({ keyName }: { keyName: string | undefined }) {
  const t = useTranslations('apiKeys');

  return (
    <div className="space-y-1">
      <Label>{t('productionKey')}</Label>
      <p className="text-muted-foreground text-xs">{keyName ?? t('none')}</p>
    </div>
  );
}

export function ApiKeySelectSection({ orgApiKeys, stagingKeyId, productionKeyId, onStagingKeyChange }: ApiKeySelectProps) {
  const t = useTranslations('apiKeys');

  if (orgApiKeys.length === 0) {
    return (
      <div className="mb-4 space-y-1">
        <Label>{t('stagingKey')}</Label>
        <p className="text-muted-foreground text-xs">{t('noKeys')}</p>
        <Separator className="mt-3" />
      </div>
    );
  }

  const productionKeyName = orgApiKeys.find((k) => k.id === productionKeyId)?.name;

  return (
    <div className="mb-4 space-y-3">
      <StagingKeySelect orgApiKeys={orgApiKeys} stagingKeyId={stagingKeyId} onStagingKeyChange={onStagingKeyChange} />
      <ProductionKeyDisplay keyName={productionKeyName} />
      <Separator className="mt-3" />
    </div>
  );
}
