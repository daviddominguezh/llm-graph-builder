'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface SchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
}

interface ToolSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

interface ToolTestFormProps {
  schema: ToolSchema | undefined;
  running: boolean;
  onRun: (args: Record<string, unknown>) => void;
}

type FieldValues = Record<string, string | boolean>;
type JsonErrors = Record<string, string>;

function getRequiredNames(schema: ToolSchema): Set<string> {
  return new Set(schema.required ?? []);
}

function splitFields(schema: ToolSchema): { required: string[]; optional: string[] } {
  const requiredSet = getRequiredNames(schema);
  const entries = Object.keys(schema.properties ?? {}).sort();
  return {
    required: entries.filter((n) => requiredSet.has(n)),
    optional: entries.filter((n) => !requiredSet.has(n)),
  };
}

function canRun(schema: ToolSchema | undefined, values: FieldValues, jsonErrors: JsonErrors): boolean {
  if (schema === undefined || schema.properties === undefined) return true;
  if (Object.keys(jsonErrors).length > 0) return false;
  const requiredSet = getRequiredNames(schema);
  for (const name of requiredSet) {
    const val = values[name];
    if (val === undefined || val === '') return false;
  }
  return true;
}

function buildArgs(schema: ToolSchema | undefined, values: FieldValues): Record<string, unknown> {
  if (schema?.properties === undefined) return {};
  const args: Record<string, unknown> = {};
  for (const [name, prop] of Object.entries(schema.properties)) {
    const val = values[name];
    if (val === undefined || val === '') continue;
    if (prop.type === 'boolean') {
      args[name] = val;
    } else if (prop.type === 'number' || prop.type === 'integer') {
      args[name] = Number(val);
    } else if (prop.type === 'array' || prop.type === 'object') {
      args[name] = JSON.parse(val as string) as unknown;
    } else {
      args[name] = val;
    }
  }
  return args;
}

function StringField({ name, prop, value, onChange }: FieldInputProps) {
  return (
    <Input
      value={(value as string) ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
      placeholder={prop.description ?? ''}
      className="h-7 text-xs"
    />
  );
}

interface FieldInputProps {
  name: string;
  prop: SchemaProperty;
  value: string | boolean | undefined;
  onChange: (name: string, value: string | boolean) => void;
  jsonError?: string;
  onJsonBlur?: (name: string, value: string) => void;
}

function EnumField({ name, prop, value, onChange }: FieldInputProps) {
  return (
    <Select
      value={(value as string) ?? ''}
      onValueChange={(v) => { if (v !== null) onChange(name, v); }}
      items={(prop.enum ?? []).map((e) => ({ value: e, label: e }))}
    >
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(prop.enum ?? []).map((e) => (
          <SelectItem key={e} value={e}>{e}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NumberField({ name, value, onChange }: FieldInputProps) {
  return (
    <Input
      type="number"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
      className="h-7 text-xs"
    />
  );
}

function BooleanField({ name, value, onChange }: FieldInputProps) {
  return (
    <Checkbox
      checked={value === true}
      onCheckedChange={(checked) => onChange(name, checked === true)}
    />
  );
}

function JsonField({ name, value, onChange, jsonError, onJsonBlur }: FieldInputProps) {
  const t = useTranslations('toolTest');
  return (
    <div className="flex flex-col gap-1">
      <Textarea
        value={(value as string) ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        onBlur={() => onJsonBlur?.(name, (value as string) ?? '')}
        placeholder={t('jsonPlaceholder')}
        className="min-h-24 bg-muted/30 font-mono text-[11px]"
      />
      {jsonError !== undefined && (
        <span className="text-[10px] text-destructive">{jsonError}</span>
      )}
    </div>
  );
}

function FieldWidget(props: FieldInputProps) {
  const { prop } = props;
  if (prop.enum !== undefined && prop.enum.length > 0) return <EnumField {...props} />;
  if (prop.type === 'number' || prop.type === 'integer') return <NumberField {...props} />;
  if (prop.type === 'boolean') return <BooleanField {...props} />;
  if (prop.type === 'array' || prop.type === 'object') return <JsonField {...props} />;
  return <StringField {...props} />;
}

function FieldEntry({
  name,
  prop,
  isRequired,
  value,
  onChange,
  jsonError,
  onJsonBlur,
}: {
  name: string;
  prop: SchemaProperty;
  isRequired: boolean;
  value: string | boolean | undefined;
  onChange: (name: string, value: string | boolean) => void;
  jsonError?: string;
  onJsonBlur: (name: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="flex items-center gap-1">
        <code className="font-mono text-[11px]">{name}</code>
        {isRequired && <span className="text-destructive">*</span>}
      </Label>
      {prop.description !== undefined && (
        <span className="text-[10px] leading-tight text-muted-foreground">{prop.description}</span>
      )}
      <FieldWidget
        name={name}
        prop={prop}
        value={value}
        onChange={onChange}
        jsonError={jsonError}
        onJsonBlur={onJsonBlur}
      />
    </div>
  );
}

function OptionalSection({ children }: { children: React.ReactNode }) {
  const t = useTranslations('toolTest');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {t('optional')}
      </button>
      {open && <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  );
}

function RunButton({ enabled, running, onRun }: { enabled: boolean; running: boolean; onRun: () => void }) {
  const t = useTranslations('toolTest');
  return (
    <div className="shrink-0 border-t bg-background p-2">
      <Button className="w-full" disabled={!enabled || running} onClick={onRun}>
        {running && <Loader2 className="size-3 animate-spin" />}
        {running ? t('running') : t('run')}
      </Button>
      {!enabled && !running && (
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">{t('requiredFields')}</p>
      )}
    </div>
  );
}

export function ToolTestForm({ schema, running, onRun }: ToolTestFormProps) {
  const t = useTranslations('toolTest');
  const [values, setValues] = useState<FieldValues>({});
  const [jsonErrors, setJsonErrors] = useState<JsonErrors>({});

  const { required, optional } = useMemo(() => splitFields(schema ?? {}), [schema]);
  const hasNoProps = schema?.properties === undefined || Object.keys(schema.properties).length === 0;
  const startExpanded = required.length === 0 && optional.length > 0;
  const enabled = canRun(schema, values, jsonErrors);

  const handleChange = useCallback((name: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setJsonErrors((prev) => {
      if (name in prev) {
        const next = { ...prev };
        delete next[name];
        return next;
      }
      return prev;
    });
  }, []);

  const handleJsonBlur = useCallback((name: string, value: string) => {
    if (value === '') return;
    try {
      JSON.parse(value);
      setJsonErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    } catch {
      setJsonErrors((prev) => ({ ...prev, [name]: t('invalidJson') }));
    }
  }, [t]);

  const handleRun = useCallback(() => {
    onRun(buildArgs(schema, values));
  }, [schema, values, onRun]);

  const properties = useMemo(() => schema?.properties ?? {}, [schema]);

  const renderField = useCallback(
    (name: string, isRequired: boolean) => {
      const prop = properties[name];
      if (prop === undefined) return null;
      return (
        <FieldEntry
          key={name}
          name={name}
          prop={prop}
          isRequired={isRequired}
          value={values[name]}
          onChange={handleChange}
          jsonError={jsonErrors[name]}
          onJsonBlur={handleJsonBlur}
        />
      );
    },
    [properties, values, handleChange, jsonErrors, handleJsonBlur]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {hasNoProps ? (
          <p className="text-xs text-muted-foreground">{t('noInput')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {required.map((name) => renderField(name, true))}
            {optional.length > 0 && startExpanded && (
              <div className="flex flex-col gap-4">
                {optional.map((name) => renderField(name, false))}
              </div>
            )}
            {optional.length > 0 && !startExpanded && (
              <OptionalSection>
                {optional.map((name) => renderField(name, false))}
              </OptionalSection>
            )}
          </div>
        )}
      </div>
      <RunButton enabled={enabled} running={running} onRun={handleRun} />
    </div>
  );
}
