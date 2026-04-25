'use client';

import {
  disconnectGoogleCalendar,
  getGoogleCalendarConnectionStatus,
} from '@/app/actions/googleOauth';
import { initiateGoogleCalendarOAuth } from '@/app/lib/googleOauthClient';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Link2, Loader2, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface GoogleCalendarInitialStatus {
  connected: boolean;
  expiresAt?: string;
}

interface GoogleCalendarSectionProps {
  orgId: string;
  initialStatus: GoogleCalendarInitialStatus;
}

function ConnectedIndicator(): React.JSX.Element {
  const t = useTranslations('googleCalendar');
  return (
    <div className="animate-in fade-in-0 slide-in-from-top-1 duration-200 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{t('connected')}</span>
    </div>
  );
}

function useFocusRefresh(refresh: () => Promise<void>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh, enabled]);
}

interface ActionButtonsProps {
  connected: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ActionButtons({ connected, busy, onConnect, onDisconnect }: ActionButtonsProps): React.JSX.Element {
  const t = useTranslations('googleCalendar');
  if (connected) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="border-[0.5px] rounded-md hover:text-destructive hover:bg-destructive/10"
        disabled={busy}
        onClick={onDisconnect}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
        {t('disconnect')}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="border-[0.5px] rounded-md"
      disabled={busy}
      onClick={onConnect}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
      {t('connect')}
    </Button>
  );
}

export function GoogleCalendarSection({
  orgId,
  initialStatus,
}: GoogleCalendarSectionProps): React.JSX.Element {
  const t = useTranslations('googleCalendar');
  const [state, setState] = useState<GoogleCalendarInitialStatus>(initialStatus);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const status = await getGoogleCalendarConnectionStatus(orgId);
    setState({ connected: status.connected, expiresAt: status.expiresAt });
  }, [orgId]);

  useFocusRefresh(refresh, !busy);

  const handleConnect = useCallback(async () => {
    setBusy(true);
    try {
      await initiateGoogleCalendarOAuth(orgId);
    } catch {
      toast.error(t('connectError'));
    } finally {
      setBusy(false);
    }
  }, [orgId, t]);

  const handleDisconnect = useCallback(async () => {
    setBusy(true);
    const ok = await disconnectGoogleCalendar(orgId);
    if (ok) {
      toast.success(t('disconnectSuccess'));
      await refresh();
    } else {
      toast.error(t('disconnectError'));
    }
    setBusy(false);
  }, [orgId, refresh, t]);

  return (
    <Card className="bg-transparent ring-0 border-transparent">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <ActionButtons
            connected={state.connected}
            busy={busy}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {state.connected ? (
          <ConnectedIndicator />
        ) : (
          <p className="animate-in fade-in-0 slide-in-from-top-1 duration-200 text-muted-foreground text-xs bg-muted py-2 px-3 rounded-md">
            {t('notConnected')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
