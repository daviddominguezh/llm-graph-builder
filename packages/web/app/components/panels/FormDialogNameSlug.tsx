'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { slugNormalize } from '@daviddh/llm-graph-runner';
import { checkSlugUniqueAction } from '@/app/actions/forms';
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
  dispatch: (
    action: { type: 'INPUT_CHANGED'; slug: string } | { type: 'UNIQ_RESULT'; unique: boolean }
  ) => void,
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

function useReportValidity(value: Value, phase: SlugPhase, onChange: Props['onChange']): void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const isValid = value.name.trim() !== '' && phase === 'unique';
    onChangeRef.current({ name: value.name, slug: value.slug, isValid });
  }, [value.name, value.slug, phase]);
}

export function FormDialogNameSlug({ agentId, value, onChange, disabled }: Props) {
  const t = useTranslations('forms.field');
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
        onBlur={handleBlur}
      />
      {state.phase === 'taken' && <p className="text-xs text-destructive">{t('identifier.taken')}</p>}
    </div>
  );
}
