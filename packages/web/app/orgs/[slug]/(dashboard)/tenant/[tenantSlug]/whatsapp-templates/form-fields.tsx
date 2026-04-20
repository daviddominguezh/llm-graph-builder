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

import { VariableBuilder } from './variable-builder';

export const BODY_MAX_LENGTH = 1600;

const BODY_PLACEHOLDER_TEMPLATE = 'e.g. Hi {{1}}, your report {{2}} is ready for review.';

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted-foreground">{children}</p>;
}

export function NameField() {
  const t = useTranslations('whatsappTemplates.fields');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="name">{t('nameLabel')}</Label>
      <Input id="name" name="name" type="text" placeholder={t('namePlaceholder')} required />
      <FieldHint>{t('nameHint')}</FieldHint>
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="body">{t('bodyLabel')}</Label>
      <Textarea
        id="body"
        name="body"
        placeholder={BODY_PLACEHOLDER_TEMPLATE}
        required
        maxLength={BODY_MAX_LENGTH}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        className={`font-mono ${showError ? 'border-destructive' : ''}`}
      />
      <div className="flex items-start justify-between gap-3">
        {error !== null ? (
          <p className="text-[11px] leading-snug text-destructive">{error}</p>
        ) : (
          <FieldHint>{t('bodyHint')}</FieldHint>
        )}
        <p
          className={`shrink-0 text-[11px] tabular-nums ${
            isOverLimit ? 'text-destructive' : 'text-muted-foreground'
          }`}
        >
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="language">{t('languageLabel')}</Label>
      <Select name="language" defaultValue="en">
        <SelectTrigger>
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
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="category">{t('categoryLabel')}</Label>
      <Select name="category" defaultValue="utility">
        <SelectTrigger>
          <SelectValue placeholder={t('categoryPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="utility">{tCat('utility')}</SelectItem>
          <SelectItem value="marketing">{tCat('marketing')}</SelectItem>
          <SelectItem value="authentication">{tCat('authentication')}</SelectItem>
        </SelectContent>
      </Select>
      <FieldHint>{t('categoryHint')}</FieldHint>
    </div>
  );
}

export function DescriptionField() {
  const t = useTranslations('whatsappTemplates.fields');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="description">{t('descriptionLabel')}</Label>
      <Textarea
        id="description"
        name="description"
        placeholder={t('descriptionPlaceholder')}
        rows={2}
      />
      <FieldHint>{t('descriptionHint')}</FieldHint>
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

  function label(conn: WhatsAppChannelConnection): string {
    if (conn.phone_number !== null && conn.phone_number !== '') {
      return conn.phone_number;
    }
    if (conn.waba_id !== null && conn.waba_id !== '') {
      return t('connectionWabaFallback', { wabaId: conn.waba_id });
    }
    return t('connectionIdFallback', { id: conn.id.slice(0, 8) });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="channelConnectionId">{t('connectionLabel')}</Label>
      <Select name="channelConnectionId" defaultValue={defaultValue}>
        <SelectTrigger>
          <SelectValue placeholder={t('connectionPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {connections.map((conn) => (
            <SelectItem key={conn.id} value={conn.id}>
              <span className="font-mono">{label(conn)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldHint>{t('connectionHint')}</FieldHint>
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
    <div className="flex flex-col gap-1.5">
      <Label>{t('variablesLabel')}</Label>
      <VariableBuilder value={variables} onChange={onChange} />
      {errors.length > 0 ? (
        <div className="space-y-0.5">
          {errors.map((error) => (
            <p key={error} className="text-[11px] leading-snug text-destructive">
              {error}
            </p>
          ))}
        </div>
      ) : (
        <FieldHint>{t('variablesHint')}</FieldHint>
      )}
    </div>
  );
}
