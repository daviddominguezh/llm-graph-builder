import { checkSlugAvailabilityAction } from '@/app/actions/slugs';
import { useEffect, useRef, useState, useTransition } from 'react';

type SlugTable = 'agents' | 'organizations';

interface SlugResult {
  available: boolean | null;
  slug: string | null;
}

interface SlugAvailability {
  checking: boolean;
  available: boolean | null;
  slug: string | null;
}

const DEBOUNCE_MS = 1200;

export function useSlugAvailability(name: string, table: SlugTable): SlugAvailability {
  const [result, setResult] = useState<SlugResult>({ available: null, slug: null });
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmed = name.trim();

  useEffect(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);

    if (trimmed === '') return;

    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await checkSlugAvailabilityAction(trimmed, table);
        if (res === null) {
          setResult({ available: null, slug: null });
        } else {
          setResult({ available: res.available, slug: res.slug });
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [trimmed, table]);

  if (trimmed === '') return { checking: false, available: null, slug: null };

  return { checking: isPending, available: result.available, slug: result.slug };
}
