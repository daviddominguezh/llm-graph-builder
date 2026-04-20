'use client';

import { useTranslations } from 'next-intl';

import type { WhatsAppChannelConnection, WhatsAppTemplateVariable } from '@/app/lib/whatsappTemplates';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { VariableBuilder } from '../variable-builder';

export const BODY_MAX_LENGTH = 1600;

const BODY_PLACEHOLDER_TEMPLATE = 'e.g. Hi {{1}}, your report {{2}} is ready for review.';

export function NameField() {
  const t = useTranslations('whatsappTemplates.fields');
  return (
    <div className="space-y-2">
      <Label htmlFor="name" className="text-foreground">
        {t('nameLabel')}
      </Label>
      <Input
        id="name"
        name="name"
        type="text"
        placeholder={t('namePlaceholder')}
        required
        className="border-border focus:border-foreground"
      />
      <p className="text-xs text-muted-foreground">{t('nameHint')}</p>
    </div>
  );
}

export function BodyField({
  error,
  charCount,
  onChange,
}: {
  error: string | null;
  charCount: number;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('whatsappTemplates.fields');
  const isOverLimit = charCount > BODY_MAX_LENGTH;
  const showError = error !== null || isOverLimit;

  return (
    <div className="space-y-2">
      <Label htmlFor="body" className="text-foreground">
        {t('bodyLabel')}
      </Label>
      <Textarea
        id="body"
        name="body"
        placeholder={BODY_PLACEHOLDER_TEMPLATE}
        required
        maxLength={BODY_MAX_LENGTH}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        className={`border-border focus:border-foreground resize-none font-mono text-sm ${showError ? 'border-destructive' : ''}`}
      />
      <div className="flex justify-between">
        <div>
          {error !== null ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t('bodyHint')}</p>
          )}
        </div>
        <p className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
          {t('bodyCharCount', { count: charCount, max: BODY_MAX_LENGTH })}
        </p>
      </div>
    </div>
  );
}

export function LanguageField() {
  const t = useTranslations('whatsappTemplates.fields');
  const tLang = useTranslations('whatsappTemplates.languages');
  return (
    <div className="space-y-2">
      <Label htmlFor="language" className="text-foreground">
        {t('languageLabel')}
      </Label>
      <Select name="language" defaultValue="en">
        <SelectTrigger className="border-border focus:border-foreground">
          <SelectValue placeholder={t('languagePlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{tLang('en')}</SelectItem>
          <SelectItem value="en_US">{tLang('en_US')}</SelectItem>
          <SelectItem value="es">{tLang('es')}</SelectItem>
          <SelectItem value="es_MX">{tLang('es_MX')}</SelectItem>
          <SelectItem value="pt_BR">{tLang('pt_BR')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function CategoryField() {
  const t = useTranslations('whatsappTemplates.fields');
  const tCat = useTranslations('whatsappTemplates.categories');
  return (
    <div className="space-y-2">
      <Label htmlFor="category" className="text-foreground">
        {t('categoryLabel')}
      </Label>
      <Select name="category" defaultValue="utility">
        <SelectTrigger className="border-border focus:border-foreground">
          <SelectValue placeholder={t('categoryPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="utility">{tCat('utility')}</SelectItem>
          <SelectItem value="marketing">{tCat('marketing')}</SelectItem>
          <SelectItem value="authentication">{tCat('authentication')}</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('categoryHint')}</p>
    </div>
  );
}

export function DescriptionField() {
  const t = useTranslations('whatsappTemplates.fields');
  return (
    <div className="space-y-2">
      <Label htmlFor="description" className="text-foreground">
        {t('descriptionLabel')}
      </Label>
      <Textarea
        id="description"
        name="description"
        placeholder={t('descriptionPlaceholder')}
        rows={3}
        className="border-border focus:border-foreground resize-none"
      />
      <p className="text-xs text-muted-foreground">{t('descriptionHint')}</p>
    </div>
  );
}

export function ChannelConnectionField({
  connections,
}: {
  connections: WhatsAppChannelConnection[];
}) {
  const t = useTranslations('whatsappTemplates.fields');
  const first = connections[0];
  const defaultValue = first !== undefined ? first.id : '';

  return (
    <div className="space-y-2">
      <Label htmlFor="channelConnectionId" className="text-foreground">
        {t('connectionLabel')}
      </Label>
      <Select name="channelConnectionId" defaultValue={defaultValue}>
        <SelectTrigger className="border-border focus:border-foreground">
          <SelectValue placeholder={t('connectionPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {connections.map((conn) => (
            <SelectItem key={conn.id} value={conn.id}>
              {t('connectionOption', {
                id: `${conn.id.slice(0, 8)}…`,
                tenantId: conn.tenant_id.slice(0, 8),
              })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{t('connectionHint')}</p>
    </div>
  );
}

export function VariablesField({
  variables,
  onChange,
  errors,
}: {
  variables: WhatsAppTemplateVariable[];
  onChange: (vars: WhatsAppTemplateVariable[]) => void;
  errors: string[];
}) {
  const t = useTranslations('whatsappTemplates.fields');
  return (
    <div className="space-y-2">
      <Label className="text-foreground">{t('variablesLabel')}</Label>
      <VariableBuilder value={variables} onChange={onChange} />
      {errors.length > 0 ? (
        <div className="space-y-1">
          {errors.map((error) => (
            <p key={error} className="text-xs text-destructive">
              {error}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('variablesHint')}</p>
      )}
    </div>
  );
}
