'use client';

import { Check, Loader2, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { slugNormalize } from '@daviddh/llm-graph-runner';
import { checkSlugUniqueAction } from '@/app/actions/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { initialSlugUx, slugUxReducer, type SlugPhase } from './FormDialogNameSlug.stateMachine';

interface Value {
  name: string;
  slug: string;
}

interface Props {
  agentId: string;
  value: Value;
  onChange: (next: { name: string; slug: string; isValid: boolean }) => void;
  disabled?: boolean;
}

const CHECK_DELAY_MS = 300;
const BLUR_DEFER_MS = 800;

function useSlugUniquenessCheck(
  agentId: string,
  slug: string,
  disabled: boolean,
  dispatch: (action: { type: 'INPUT_CHANGED'; slug: string } | { type: 'UNIQ_RESULT'; unique: boolean }) => void,
  lastKeyRef: React.MutableRefObject<number>
): void {
  useEffect(() => {
    dispatch({ type: 'INPUT_CHANGED', slug });
    lastKeyRef.current = Date.now();
    if (slug === '' || disabled) return undefined;
    const handle = setTimeout(() => {
      void checkSlugUniqueAction(agentId, slug).then((r) => {
        dispatch({ type: 'UNIQ_RESULT', unique: r.unique });
      });
    }, CHECK_DELAY_MS);
    return (): void => {
      clearTimeout(handle);
    };
  }, [agentId, slug, disabled, dispatch, lastKeyRef]);
}

function useReportValidity(
  value: Value,
  phase: SlugPhase,
  onChange: Props['onChange']
): void {
  useEffect(() => {
    const isValid = value.name.trim() !== '' && phase === 'unique';
    onChange({ name: value.name, slug: value.slug, isValid });
  }, [value.name, value.slug, phase, onChange]);
}

export function FormDialogNameSlug({ agentId, value, onChange, disabled }: Props) {
  const t = useTranslations('forms.field');
  const [editingSlug, setEditingSlug] = useState(false);
  const [state, dispatch] = useReducer(slugUxReducer, undefined, initialSlugUx);
  const lastKeyRef = useRef<number>(0);

  useSlugUniquenessCheck(agentId, value.slug, disabled === true, dispatch, lastKeyRef);
  useReportValidity(value, state.phase, onChange);

  const handleBlur = useCallback(() => {
    const elapsed = Date.now() - lastKeyRef.current;
    if (elapsed < BLUR_DEFER_MS) {
      setTimeout(() => dispatch({ type: 'BLUR' }), BLUR_DEFER_MS - elapsed);
    } else {
      dispatch({ type: 'BLUR' });
    }
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <NameField value={value} onChange={onChange} t={t} disabled={disabled} />
      <SlugField
        value={value}
        onChange={onChange}
        editingSlug={editingSlug}
        setEditingSlug={setEditingSlug}
        phase={state.phase}
        onBlur={handleBlur}
        disabled={disabled}
        t={t}
      />
    </div>
  );
}

interface NameFieldProps {
  value: Value;
  onChange: Props['onChange'];
  t: ReturnType<typeof useTranslations>;
  disabled?: boolean;
}

function NameField({ value, onChange, t, disabled }: NameFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="form-name">{t('name.label')}</Label>
      <Input
        id="form-name"
        disabled={disabled}
        placeholder={t('name.placeholder')}
        value={value.name}
        onChange={(e): void => {
          onChange({ name: e.target.value, slug: slugNormalize(e.target.value), isValid: false });
        }}
      />
    </div>
  );
}

interface SlugFieldProps {
  value: Value;
  onChange: Props['onChange'];
  editingSlug: boolean;
  setEditingSlug: (next: boolean) => void;
  phase: SlugPhase;
  onBlur: () => void;
  disabled?: boolean;
  t: ReturnType<typeof useTranslations>;
}

function SlugField(props: SlugFieldProps) {
  const { value, onChange, editingSlug, setEditingSlug, phase, onBlur, disabled, t } = props;
  return (
    <div className="flex flex-col gap-1">
      <Label>{t('identifier.label')}</Label>
      <div className="flex items-center gap-2" onBlur={onBlur}>
        <SlugDisplay value={value} onChange={onChange} editing={editingSlug} disabled={disabled} />
        {disabled !== true && (
          <Button variant="ghost" size="sm" onClick={(): void => setEditingSlug(!editingSlug)}>
            <Pencil className="size-3.5" />
            {t('identifier.edit')}
          </Button>
        )}
        <SlugStatusIcon phase={phase} />
      </div>
      <SlugErrorMessage phase={phase} t={t} />
    </div>
  );
}

interface SlugErrorMessageProps {
  phase: SlugPhase;
  t: ReturnType<typeof useTranslations>;
}

function SlugErrorMessage({ phase, t }: SlugErrorMessageProps) {
  if (phase === 'invalid-format') {
    return <p className="text-xs text-destructive">{t('identifier.invalidFormat')}</p>;
  }
  if (phase === 'taken') {
    return <p className="text-xs text-destructive">{t('identifier.taken')}</p>;
  }
  return null;
}

interface SlugDisplayProps {
  value: Value;
  onChange: Props['onChange'];
  editing: boolean;
  disabled?: boolean;
}

function SlugDisplay({ value, onChange, editing, disabled }: SlugDisplayProps) {
  if (editing && disabled !== true) {
    return (
      <Input
        value={value.slug}
        className="h-8"
        onChange={(e): void => {
          onChange({ name: value.name, slug: slugNormalize(e.target.value), isValid: false });
        }}
      />
    );
  }
  const display = value.slug === '' ? '—' : value.slug;
  return <code className="rounded-md bg-muted px-2 py-1 text-xs">{display}</code>;
}

function SlugStatusIcon({ phase }: { phase: SlugPhase }) {
  if (phase === 'checking') {
    return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="checking" />;
  }
  if (phase === 'unique') {
    return <Check className="size-4 text-muted-foreground" aria-label="available" />;
  }
  return null;
}
