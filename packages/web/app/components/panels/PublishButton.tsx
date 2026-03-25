'use client';

import { publishGraph } from '@/app/lib/graphApi';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

const FEEDBACK_DURATION = 1500;

interface PublishButtonProps {
  agentId: string;
  agentSlug: string;
  version: number;
  canPublish: boolean;
  hasApiKey: boolean;
  flush: () => Promise<void>;
  onPublished: (newVersion: number) => void;
}

function buildCurlCommand(agentSlug: string, version: number): string {
  return `curl --location 'http://localhost:4000/api/agents/${agentSlug}/${String(version)}' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer <YOUR_API_KEY>' \\
--data '{
    "tenantId": "<TENANT>",
    "userId": "<USER>",
    "sessionId": "<SESSION>",
    "channel": "web",
    "message": {
        "text": "Hello"
    }
}'`;
}

function CopyButton({ text }: { text: string }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), FEEDBACK_DURATION);
  }, [text]);

  const Icon = copied ? Check : Copy;
  const label = copied ? t('copied') : t('copyCurl');

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleCopy} aria-label={label} title={label}>
      <Icon className="size-3.5" />
    </Button>
  );
}

function CurlDisplay({ agentSlug, version }: { agentSlug: string; version: number }) {
  const t = useTranslations('editor');
  const curl = buildCurlCommand(agentSlug, version);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{t('curlExample')}</span>
        <CopyButton text={curl} />
      </div>
      <pre className="bg-muted rounded-md border p-2.5 text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap break-all font-mono">
        {curl}
      </pre>
    </div>
  );
}

function PublishSpinner() {
  return (
    <Button variant="default" size="sm" disabled className="h-10 gap-1.5 px-3 rounded-md">
      <Loader2 className="size-4 animate-spin" />
    </Button>
  );
}

function PublishStatus({ version }: { version: number }) {
  const t = useTranslations('editor');
  const isPublished = version > 0;

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex flex-row items-center text-sm font-medium ${isPublished ? 'text-foreground' : 'text-muted-foreground'}`}
      >
        {isPublished ? (
          <>
            <span className="text-[10px] text-muted-foreground rounded-full border px-1.5 font-mono mr-1.5 bg-background">
              v{version}
            </span>
            <Separator orientation="vertical" />
            <span
              className={`mx-1.5 inline-block size-2.5 rounded-full ${isPublished ? 'bg-green-500' : 'bg-muted-foreground'}`}
            />
            {t('publishedVersion')}
          </>
        ) : (
          t('draft')
        )}
      </span>
    </div>
  );
}

interface PopoverBodyProps {
  agentSlug: string;
  version: number;
  onPublish: () => void;
}

function PopoverBody({ agentSlug, version, onPublish }: PopoverBodyProps) {
  const t = useTranslations('editor');

  return (
    <div className="flex flex-col gap-3 p-0.5">
      <PublishStatus version={version} />
      <Separator />
      {version > 0 && <CurlDisplay agentSlug={agentSlug} version={version} />}
      <Button variant="default" size="sm" className="w-full" onClick={onPublish}>
        {t('publish')} v{version + 1}
      </Button>
    </div>
  );
}

function DisabledPublishButton() {
  const t = useTranslations('editor');
  const tKeys = useTranslations('apiKeys');

  const button = (
    <Button variant="default" size="sm" disabled className="h-10 gap-1.5 px-3 rounded-md">
      {t('publish')}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{button}</TooltipTrigger>
      <TooltipContent>{tKeys('requiresProductionKey')}</TooltipContent>
    </Tooltip>
  );
}

export function PublishButton(props: PublishButtonProps) {
  const { agentId, agentSlug, version, canPublish, hasApiKey, flush, onPublished } = props;
  const t = useTranslations('editor');
  const [publishing, setPublishing] = useState(false);
  const [open, setOpen] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    setOpen(false);
    try {
      await flush();
      const { version: newVersion } = await publishGraph(agentId);
      onPublished(newVersion);
    } catch {
      toast.error(t('publishFailed'));
    } finally {
      setPublishing(false);
    }
  }

  if (publishing) return <PublishSpinner />;
  if (!canPublish || !hasApiKey) return <DisabledPublishButton />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="default" size="sm" className="h-10 gap-1.5 px-3 rounded-md" />}
      >
        {t('publish')}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" sideOffset={8} className="w-96">
        <PopoverBody agentSlug={agentSlug} version={version} onPublish={handlePublish} />
      </PopoverContent>
    </Popover>
  );
}
