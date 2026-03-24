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
  onProductionKeyChange: (keyId: string | null) => void;
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
    <div className="space-y-1.5">
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

function ProductionKeySelect({
  orgApiKeys,
  productionKeyId,
  onProductionKeyChange,
}: {
  orgApiKeys: ApiKeyRow[];
  productionKeyId: string | null;
  onProductionKeyChange: (keyId: string | null) => void;
}) {
  const t = useTranslations('apiKeys');

  const items = [
    { value: '', label: t('none') },
    ...orgApiKeys.map((key) => ({ value: key.id, label: key.name })),
  ];

  return (
    <div className="space-y-1.5">
      <Label>{t('productionKey')}</Label>
      <Select
        value={productionKeyId ?? ''}
        items={items}
        onValueChange={(val) => onProductionKeyChange(val === '' ? null : val)}
      >
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

export function ApiKeySelectSection(props: ApiKeySelectProps) {
  const { orgApiKeys, stagingKeyId, productionKeyId, onStagingKeyChange, onProductionKeyChange } = props;
  const t = useTranslations('apiKeys');

  if (orgApiKeys.length === 0) {
    return (
      <div className="mb-3 space-y-1">
        <Label>{t('stagingKey')}</Label>
        <p className="text-muted-foreground text-xs">{t('noKeys')}</p>
        <Separator className="mt-3" />
      </div>
    );
  }

  return (
    <div className="mb-3 space-y-3">
      <StagingKeySelect orgApiKeys={orgApiKeys} stagingKeyId={stagingKeyId} onStagingKeyChange={onStagingKeyChange} />
      <ProductionKeySelect
        orgApiKeys={orgApiKeys}
        productionKeyId={productionKeyId}
        onProductionKeyChange={onProductionKeyChange}
      />
      <Separator className="mt-3" />
    </div>
  );
}
