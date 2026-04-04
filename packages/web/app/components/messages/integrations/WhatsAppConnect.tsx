'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { WhatsAppIcon } from '../shared/icons/WhatsAppIcon';
import { useEmbeddedSignup } from './useEmbeddedSignup';
import { useFacebookSdk } from './useFacebookSdk';
import { connectWhatsAppIntegration } from './whatsappApi';

interface WhatsAppConnectProps {
  tenantId: string;
  agentId: string;
  onSuccess: () => void;
}

const FB_CONFIG_ID = '1429125948415457';

type FlowStatus = 'idle' | 'waiting_fb' | 'connecting' | 'success' | 'error';

interface FlowState {
  status: FlowStatus;
  authCode: string;
  phone: string;
  errorMessage: string;
}

const INITIAL_STATE: FlowState = {
  status: 'idle',
  authCode: '',
  phone: '',
  errorMessage: '',
};

export function WhatsAppConnect({ tenantId, agentId, onSuccess }: WhatsAppConnectProps) {
  const t = useTranslations('editor.channels.whatsappConnect');
  const sdkReady = useFacebookSdk();
  const signup = useEmbeddedSignup();
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<FlowState>(INITIAL_STATE);

  const resetFlow = useCallback(() => {
    setFlow(INITIAL_STATE);
    signup.reset();
  }, [signup]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) resetFlow();
    },
    [resetFlow]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>
        <WhatsAppIcon size={14} className="text-emerald-500" />
        {t('connectButton')}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <ConnectForm
          flow={flow}
          setFlow={setFlow}
          signup={signup}
          sdkReady={sdkReady}
          tenantId={tenantId}
          agentId={agentId}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Inner form — extracted to stay within max-lines-per-function
// ---------------------------------------------------------------------------

interface ConnectFormProps {
  flow: FlowState;
  setFlow: React.Dispatch<React.SetStateAction<FlowState>>;
  signup: ReturnType<typeof useEmbeddedSignup>;
  sdkReady: boolean;
  tenantId: string;
  agentId: string;
  onSuccess: () => void;
}

function ConnectForm(props: ConnectFormProps) {
  const { flow, setFlow, signup, sdkReady, tenantId, agentId, onSuccess } = props;

  // When signup data arrives + authCode ready => call backend
  useAutoConnect({ flow, setFlow, signup, tenantId, agentId, onSuccess });

  // When embedded signup reports an error
  useSignupError({ signup, setFlow });

  return (
    <div className="flex flex-col gap-4">
      <PhoneField phone={flow.phone} setFlow={setFlow} disabled={flow.status !== 'idle'} />
      <LaunchButton flow={flow} setFlow={setFlow} sdkReady={sdkReady} />
      <StatusFeedback status={flow.status} errorMessage={flow.errorMessage} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PhoneField(props: {
  phone: string;
  setFlow: React.Dispatch<React.SetStateAction<FlowState>>;
  disabled: boolean;
}) {
  const t = useTranslations('editor.channels.whatsappConnect');

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="wa-phone">{t('phoneLabel')}</Label>
      <Input
        id="wa-phone"
        type="tel"
        placeholder={t('phonePlaceholder')}
        value={props.phone}
        disabled={props.disabled}
        onChange={(e) => props.setFlow((s) => ({ ...s, phone: e.target.value }))}
      />
      <p className="text-xs text-muted-foreground">{t('phoneHint')}</p>
    </div>
  );
}

function LaunchButton(props: {
  flow: FlowState;
  setFlow: React.Dispatch<React.SetStateAction<FlowState>>;
  sdkReady: boolean;
}) {
  const { flow, setFlow, sdkReady } = props;
  const t = useTranslations('editor.channels.whatsappConnect');

  const handleClick = () => {
    if (!flow.phone.trim()) {
      setFlow((s) => ({ ...s, status: 'error', errorMessage: t('phoneRequired') }));
      return;
    }
    setFlow((s) => ({ ...s, status: 'waiting_fb', errorMessage: '' }));
    launchFBLogin(setFlow);
  };

  const busy = flow.status === 'waiting_fb' || flow.status === 'connecting';

  return (
    <Button onClick={handleClick} disabled={!sdkReady || busy || flow.status === 'success'}>
      {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
      {t('launchButton')}
    </Button>
  );
}

function StatusFeedback(props: { status: FlowStatus; errorMessage: string }) {
  const t = useTranslations('editor.channels.whatsappConnect');

  if (props.status === 'error' && props.errorMessage) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0" />
        <span>{props.errorMessage}</span>
      </div>
    );
  }

  if (props.status === 'success') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
        <CheckCircle2 className="size-4 shrink-0" />
        <span>{t('success')}</span>
      </div>
    );
  }

  if (props.status === 'waiting_fb') {
    return <p className="text-xs text-muted-foreground">{t('waitingFacebook')}</p>;
  }

  return null;
}

// ---------------------------------------------------------------------------
// FB login launcher (extracted pure function, no hook)
// ---------------------------------------------------------------------------

function launchFBLogin(setFlow: React.Dispatch<React.SetStateAction<FlowState>>): void {
  window.FB.login(
    (response) => {
      const auth = response.authResponse;
      if (response.status === 'connected' && auth?.code) {
        setFlow((s) => ({ ...s, authCode: auth.code ?? '' }));
      } else {
        setFlow((s) => ({ ...s, status: 'error', errorMessage: 'Failed to authenticate with Facebook' }));
      }
    },
    {
      config_id: FB_CONFIG_ID,
      auth_type: 'rerequest',
      response_type: 'code',
      override_default_response_type: true,
      extras: { sessionInfoVersion: 3, featureType: 'whatsapp_business_app_onboarding' },
    }
  );
}

// ---------------------------------------------------------------------------
// Side-effect hooks (extracted to respect max-lines-per-function)
// ---------------------------------------------------------------------------

interface AutoConnectDeps {
  flow: FlowState;
  setFlow: React.Dispatch<React.SetStateAction<FlowState>>;
  signup: ReturnType<typeof useEmbeddedSignup>;
  tenantId: string;
  agentId: string;
  onSuccess: () => void;
}

function useAutoConnect(deps: AutoConnectDeps): void {
  const { flow, setFlow, signup, tenantId, agentId, onSuccess } = deps;

  useEffect(() => {
    if (!flow.authCode || !signup.data?.phoneNumberId || !signup.data.wabaId) return;
    if (flow.status !== 'waiting_fb') return;

    setFlow((s) => ({ ...s, status: 'connecting' }));

    void connectWhatsAppIntegration(tenantId, {
      phone: flow.phone,
      phoneNumberId: signup.data.phoneNumberId,
      waba: signup.data.wabaId,
      authCode: flow.authCode,
      agentId,
    })
      .then(() => {
        setFlow((s) => ({ ...s, status: 'success' }));
        onSuccess();
      })
      .catch((err: Error) => {
        setFlow((s) => ({ ...s, status: 'error', errorMessage: err.message }));
      });
  }, [flow.authCode, signup.data, flow.status, flow.phone, tenantId, agentId, onSuccess, setFlow]);
}

function useSignupError(deps: {
  signup: ReturnType<typeof useEmbeddedSignup>;
  setFlow: React.Dispatch<React.SetStateAction<FlowState>>;
}): void {
  const { signup, setFlow } = deps;

  useEffect(() => {
    if (signup.error) {
      setFlow((s) => ({ ...s, status: 'error', errorMessage: signup.error ?? '' }));
    }
  }, [signup.error, setFlow]);
}
