import { checkSlugAvailabilityAction } from '@/app/actions/slugs';
import { useEffect, useRef, useState } from 'react';

type SlugTable = 'agents' | 'organizations';

interface SlugAvailability {
  checking: boolean;
  available: boolean | null;
  slug: string | null;
}

const DEBOUNCE_MS = 1200;

export function useSlugAvailability(name: string, table: SlugTable): SlugAvailability {
  const [state, setState] = useState<SlugAvailability>({
    checking: false,
    available: null,
    slug: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = name.trim();

    if (trimmed === '') {
      setState({ checking: false, available: null, slug: null });
      return;
    }

    setState((prev) => ({ ...prev, checking: true, available: null }));

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      void checkSlugAvailabilityAction(trimmed, table).then((result) => {
        if (result === null) {
          setState({ checking: false, available: null, slug: null });
        } else {
          setState({ checking: false, available: result.available, slug: result.slug });
        }
      });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [name, table]);

  return state;
}
