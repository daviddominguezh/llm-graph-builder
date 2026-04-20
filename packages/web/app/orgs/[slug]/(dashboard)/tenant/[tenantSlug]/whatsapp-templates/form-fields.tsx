'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { WhatsAppChannelConnection, WhatsAppTemplateVariable } from '@/app/lib/whatsappTemplates';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

import { makeAddHandler, VariableBuilder } from './variable-builder';

export const BODY_MAX_LENGTH = 1600;

const BODY_PLACEHOLDER_TEMPLATE = 'e.g. Hi {{1}}, your report {{2}} is ready for review.';

function RequiredMark() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-muted-foreground/60">
      *
    </span>
  );
}

function OptionalMark({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 font-normal text-muted-foreground/70">{children}</span>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-snug text-muted-foreground">{children}</p>;
}

export function NameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('whatsappTemplates.fields');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="name">
        {t('nameLabel')}
        <RequiredMark />
      </Label>
      <Input
        id="name"
        name="name"
        type="text"
        placeholder={t('namePlaceholder')}
        autoFocus
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldHint>{t('nameHint')}</FieldHint>
    </div>
  );
}

export function BodyField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  const t = useTranslations('whatsappTemplates.fields');
  const charCount = value.length;
  const isOverLimit = charCount > BODY_MAX_LENGTH;
  const showError = error !== null || isOverLimit;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="body">
        {t('bodyLabel')}
        <RequiredMark />
      </Label>
      <Textarea
        id="body"
        name="body"
        placeholder={BODY_PLACEHOLDER_TEMPLATE}
        required
        maxLength={BODY_MAX_LENGTH}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('font-mono leading-relaxed', showError && 'border-destructive')}
      />
      <div className="flex items-start justify-between gap-3">
        {error !== null ? (
          <p className="text-[11px] leading-snug text-destructive">{error}</p>
        ) : (
          <FieldHint>{t('bodyHint')}</FieldHint>
        )}
        <p
          className={cn(
            'shrink-0 text-[11px] tabular-nums',
            isOverLimit ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {t('bodyCharCount', { count: charCount, max: BODY_MAX_LENGTH })}
        </p>
      </div>
    </div>
  );
}

type LanguageCode = 'en' | 'en_US' | 'es' | 'es_MX' | 'pt_BR';
const LANGUAGE_CODES: LanguageCode[] = ['en', 'en_US', 'es', 'es_MX', 'pt_BR'];

export function LanguageField({
  value,
  onChange,
}: {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
}) {
  const t = useTranslations('whatsappTemplates.fields');
  const tLang = useTranslations('whatsappTemplates.languages');

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="language">{t('languageLabel')}</Label>
      <Select
        name="language"
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next as LanguageCode);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{tLang(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {LANGUAGE_CODES.map((code) => (
            <SelectItem key={code} value={code}>
              {tLang(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type CategoryValue = 'utility' | 'marketing' | 'authentication';
const CATEGORY_VALUES: CategoryValue[] = ['utility', 'marketing', 'authentication'];

export function CategoryField({
  value,
  onChange,
}: {
  value: CategoryValue;
  onChange: (value: CategoryValue) => void;
}) {
  const t = useTranslations('whatsappTemplates.fields');
  const tCat = useTranslations('whatsappTemplates.categories');

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="category">
        {t('categoryLabel')}
        <RequiredMark />
      </Label>
      <Select
        name="category"
        value={value}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next as CategoryValue);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>{tCat(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_VALUES.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {tCat(cat)}
            </SelectItem>
          ))}
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
      <Label htmlFor="description">
        {t('descriptionLabel')}
        <OptionalMark>{t('descriptionOptional')}</OptionalMark>
      </Label>
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

function isPhoneLikeLabel(value: string): boolean {
  return /^\+?[\d\s\(\)\-]+$/v.test(value);
}

interface ConnectionLabel {
  text: string;
  isPhone: boolean;
}

function buildConnectionLabel(
  conn: WhatsAppChannelConnection,
  t: ReturnType<typeof useTranslations<'whatsappTemplates.fields'>>
): ConnectionLabel {
  if (conn.phone_number !== null && conn.phone_number !== '') {
    return { text: conn.phone_number, isPhone: isPhoneLikeLabel(conn.phone_number) };
  }
  if (conn.waba_id !== null && conn.waba_id !== '') {
    return { text: t('connectionWabaFallback', { wabaId: conn.waba_id }), isPhone: false };
  }
  return { text: t('connectionIdFallback', { id: conn.id.slice(0, 8) }), isPhone: false };
}

function ConnectionLabelText({ label }: { label: ConnectionLabel }) {
  return <span className={label.isPhone ? 'tabular-nums' : 'font-mono'}>{label.text}</span>;
}

export function ChannelConnectionField({
  connections,
  value,
  onChange,
}: {
  connections: WhatsAppChannelConnection[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('whatsappTemplates.fields');
  const selected = connections.find((c) => c.id === value);
  const selectedLabel = selected !== undefined ? buildConnectionLabel(selected, t) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="channelConnectionId">
        {t('connectionLabel')}
        <RequiredMark />
      </Label>
      <Select
        name="channelConnectionId"
        value={value === '' ? null : value}
        onValueChange={(next) => {
          if (typeof next === 'string') onChange(next);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue>
            {selectedLabel !== null ? (
              <ConnectionLabelText label={selectedLabel} />
            ) : (
              <span className="text-muted-foreground">{t('connectionPlaceholder')}</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {connections.map((conn) => (
            <SelectItem key={conn.id} value={conn.id}>
              <ConnectionLabelText label={buildConnectionLabel(conn, t)} />
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
  const tBuilder = useTranslations('whatsappTemplates.variableBuilder');
  const handleAdd = makeAddHandler(variables, onChange);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label>{t('variablesLabel')}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="border-[0.5px] rounded-md"
        >
          <Plus className="size-3.5" />
          {tBuilder('add')}
        </Button>
      </div>
      {variables.length === 0 ? (
        <div className="rounded-md border border-dashed bg-background px-3 py-4 text-center text-[11px] text-muted-foreground">
          {tBuilder('empty')}
        </div>
      ) : (
        <VariableBuilder value={variables} onChange={onChange} />
      )}
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
