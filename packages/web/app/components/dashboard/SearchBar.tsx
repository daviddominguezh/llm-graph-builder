'use client';

import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

const DEBOUNCE_MS = 400;

export function SearchBar({ value, onChange }: SearchBarProps) {
  const t = useTranslations('dashboard');
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  };

  return (
    <InputGroup className="w-64 border-transparent bg-card">
      <InputGroupAddon>
        <Search className="size-3.5 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput placeholder={t('searchPlaceholder')} value={localValue} onChange={handleChange} />
    </InputGroup>
  );
}
