'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState, type ReactElement } from 'react';

const DEBOUNCE_MS = 400;

interface State {
  inRange: number;
  withData: number;
}

interface Props {
  agentId: string | null;
  formSlug: string | null;
  tenantId: string;
  from: string;
  to: string;
  orgSlug: string;
  onCountChange?: (withData: number) => void;
}

export function ExportCsvMatchCount({
  agentId,
  formSlug,
  tenantId,
  from,
  to,
  orgSlug,
  onCountChange,
}: Props): ReactElement | null {
  const t = useTranslations('forms.export');
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (agentId === null || formSlug === null) {
      return undefined;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void fetchCount({ agentId, formSlug, tenantId, from, to }).then((r) => {
        if (cancelled) return;
        setState(r);
        onCountChange?.(r.withData);
      });
    }, DEBOUNCE_MS);
    return (): void => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [agentId, formSlug, tenantId, from, to, onCountChange]);

  if (agentId === null || formSlug === null) {
    return null;
  }

  if (state === null) return null;
  if (state.withData === 0) return <NoDataLine t={t} agentId={agentId} orgSlug={orgSlug} />;
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {t('matchCount', { inRange: state.inRange, withData: state.withData })}
    </p>
  );
}

interface NoDataProps {
  t: ReturnType<typeof useTranslations>;
  agentId: string | null;
  orgSlug: string;
}

function NoDataLine({ t, agentId, orgSlug }: NoDataProps): ReactElement {
  const href = agentId !== null ? `/orgs/${orgSlug}/chats?agent=${agentId}` : '#';
  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      {t('matchCountNoData.tooltip')} — {t('matchCountNoData.suggestion')}{' '}
      <Link href={href} className="text-primary underline">
        {t('matchCountNoData.viewInChatList')}
      </Link>
    </p>
  );
}

interface FetchArgs {
  agentId: string;
  formSlug: string;
  tenantId: string;
  from: string;
  to: string;
}

async function fetchCount(args: FetchArgs): Promise<State> {
  const url = `/api/agents/${args.agentId}/forms/${args.formSlug}/export/count?tenantId=${args.tenantId}&from=${args.from}&to=${args.to}`;
  const res = await fetch(url);
  if (!res.ok) return { inRange: 0, withData: 0 };
  const json = (await res.json()) as { conversationsInRange: number; conversationsWithData: number };
  return { inRange: json.conversationsInRange, withData: json.conversationsWithData };
}
