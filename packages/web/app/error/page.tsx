'use client';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const INITIAL_DELAY_MS = 5000;
const MAX_DELAY_MS = 30_000;
const DELAY_INCREMENT_MS = 5000;

type TickParams = {
  setDelay: React.Dispatch<React.SetStateAction<number>>;
  router: ReturnType<typeof useRouter>;
};

async function tick({ setDelay, router }: TickParams): Promise<void> {
  try {
    const r = await fetch('/api/auth/status', { cache: 'no-store' });
    if (r.ok) {
      router.push('/');
      return;
    }
  } catch {
    // swallow and keep polling
  }
  setDelay((d) => Math.min(MAX_DELAY_MS, d + DELAY_INCREMENT_MS));
}

export default function ErrorPage() {
  const t = useTranslations('error');
  const router = useRouter();
  const [delay, setDelay] = useState(INITIAL_DELAY_MS);

  useEffect(() => {
    const id = setTimeout(() => {
      void tick({ setDelay, router });
    }, delay);
    return () => clearTimeout(id);
  }, [delay, router]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <p className="text-muted-foreground text-xs">{t('retrying')}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    </div>
  );
}
