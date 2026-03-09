'use client';

import { publishAgentAction } from '@/app/actions/agents';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface PublishButtonProps {
  agentId: string;
  canPublish: boolean;
  hasApiKey: boolean;
  onPublished: (newVersion: number) => void;
}

function PublishSpinner() {
  return (
    <Button variant="default" size="sm" disabled className="h-10 gap-1.5 px-3">
      <Loader2 className="size-4 animate-spin" />
    </Button>
  );
}

function PublishButtonContent({
  canPublish,
  hasApiKey,
  onPublish,
}: {
  canPublish: boolean;
  hasApiKey: boolean;
  onPublish: () => void;
}) {
  const t = useTranslations('editor');
  const tKeys = useTranslations('apiKeys');
  const disabled = !canPublish || !hasApiKey;

  const button = (
    <Button
      variant="default"
      size="sm"
      onClick={disabled ? undefined : onPublish}
      disabled={disabled}
      className="h-10 gap-1.5 px-3"
    >
      {t('publish')}
    </Button>
  );

  if (hasApiKey) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{button}</TooltipTrigger>
      <TooltipContent>{tKeys('requiresKey')}</TooltipContent>
    </Tooltip>
  );
}

export function PublishButton({ agentId, canPublish, hasApiKey, onPublished }: PublishButtonProps) {
  const t = useTranslations('editor');
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    const { version: newVersion, error } = await publishAgentAction(agentId);

    if (error !== null || newVersion === null) {
      toast.error(t('publishFailed'));
      setPublishing(false);
      return;
    }

    onPublished(newVersion);
    setPublishing(false);
  }

  if (publishing) return <PublishSpinner />;

  return <PublishButtonContent canPublish={canPublish} hasApiKey={hasApiKey} onPublish={handlePublish} />;
}
