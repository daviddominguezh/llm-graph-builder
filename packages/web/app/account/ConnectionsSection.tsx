'use client';

import { createClient } from '@/app/lib/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface Identity {
  provider: string;
  email: string;
  created_at: string;
}

interface IdentitiesResponse {
  identities: Identity[];
}

interface ConnectionsProps {
  userEmail: string;
}

function GoogleIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function useIdentities() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/identities');
      if (res.ok) {
        const body = (await res.json()) as IdentitiesResponse;
        setIdentities(body.identities);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { identities, loading, reload };
}

interface DisconnectDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  confirming: boolean;
}

function DisconnectDialog({ open, onOpenChange, onConfirm, confirming }: DisconnectDialogProps) {
  const t = useTranslations('account.connections.google.confirmDisconnect');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('body')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={confirming}>
            {confirming ? <Loader2 className="size-4 animate-spin" /> : t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface GoogleRowProps {
  googleIdentity: Identity | undefined;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  connecting: boolean;
}

function GoogleRow({ googleIdentity, onConnect, onDisconnect, connecting }: GoogleRowProps) {
  const t = useTranslations('account.connections.google');
  const isConnected = googleIdentity !== undefined;

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-3">
        <GoogleIcon />
        <div>
          <p className="text-xs font-medium">{t('label')}</p>
          {isConnected && (
            <p className="text-xs text-muted-foreground">{t('connected', { email: googleIdentity.email })}</p>
          )}
        </div>
      </div>
      {isConnected ? (
        <Button variant="outline" size="sm" onClick={onDisconnect}>
          {t('disconnect')}
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={onConnect} disabled={connecting}>
          {connecting && <Loader2 className="mr-1 size-3 animate-spin" />}
          {t('connect')}
        </Button>
      )}
    </div>
  );
}

export function ConnectionsSection({ userEmail }: ConnectionsProps) {
  const t = useTranslations('account.connections');
  const tErrors = useTranslations('account.connections.errors');
  const { identities, loading, reload } = useIdentities();
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const googleIdentity = identities.find((id) => id.provider === 'google');

  async function handleConnect() {
    setConnecting(true);
    setError('');
    const supabase = createClient();
    const { error: linkError } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (linkError !== null) {
      const msg = linkError.message.toLowerCase();
      const isAlreadyLinked = msg.includes('already') || msg.includes('linked');
      setError(isAlreadyLinked ? tErrors('googleAlreadyLinked') : tErrors('linkFailed'));
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/unlink-google', { method: 'POST' });
      if (res.ok) {
        setDisconnectOpen(false);
        await reload();
        return;
      }
      const body = (await res.json()) as { error?: string };
      const isOnlyIdentity = body.error === 'cannot_unlink_only_identity';
      setError(isOnlyIdentity ? tErrors('cannotUnlinkOnlyIdentity') : tErrors('unlinkFailed'));
      setDisconnectOpen(false);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="bg-transparent ring-0">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 py-2">
              <div className="size-4 shrink-0" />
              <div>
                <p className="text-xs font-medium">{t('email.label')}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>
            </div>
            <GoogleRow
              googleIdentity={googleIdentity}
              onConnect={handleConnect}
              onDisconnect={() => setDisconnectOpen(true)}
              connecting={connecting}
            />
          </div>
        )}
        {error !== '' && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </CardContent>
      <DisconnectDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        onConfirm={handleDisconnect}
        confirming={disconnecting}
      />
    </Card>
  );
}
