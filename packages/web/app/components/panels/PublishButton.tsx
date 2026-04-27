'use client';

import { publishGraph } from '@/app/lib/graphApi';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from 'sonner';

import { DirectLinkDisplay } from './DirectLinkDisplay';
import { EmbedSnippetDisplay } from './EmbedSnippetDisplay';
import { CopyButton } from './PublishButtonShared';
import { EmptyTenantsState, type PublishTenant, TenantPicker } from './PublishButtonTenantPicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PublishButtonProps {
  agentId: string;
  agentSlug: string;
  orgSlug: string;
  tenants: PublishTenant[];
  version: number;
  canPublish: boolean;
  hasApiKey: boolean;
  flush: () => Promise<void>;
  onPublished: (newVersion: number) => void;
}

function buildCurlCommand(agentSlug: string, version: number): string {
  return `curl --location '${API_URL}/api/agents/${agentSlug}/${String(version)}' \\
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

interface CurlDisplayProps {
  agentSlug: string;
  version: number;
  publishing?: boolean;
}

function CurlHighlighter({ curl, publishing }: { curl: string; publishing: boolean }) {
  const { resolvedTheme } = useTheme();
  const syntaxTheme = resolvedTheme === 'dark' ? oneDark : oneLight;

  return (
    <div className="relative">
      {publishing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <SyntaxHighlighter
        language="bash"
        style={syntaxTheme}
        customStyle={{
          margin: 0,
          borderRadius: '0.375rem',
          fontSize: '11px',
          lineHeight: '1.625',
          padding: '0.625rem',
          wordBreak: 'break-all',
          whiteSpace: 'pre-wrap',
          maxHeight: '145px',
          overflowY: 'auto',
          opacity: publishing ? 0.4 : 1,
          transition: 'opacity 150ms',
        }}
      >
        {curl}
      </SyntaxHighlighter>
    </div>
  );
}

function CurlDisplay({ agentSlug, version, publishing = false }: CurlDisplayProps) {
  const t = useTranslations('editor');
  const curl = buildCurlCommand(agentSlug, version);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {t('curlExample')}
          {' ('}v{version}
          {'):'}
        </span>
        <CopyButton text={curl} disabled={publishing} />
      </div>
      <CurlHighlighter curl={curl} publishing={publishing} />
    </div>
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
            <span className="text-[10px] text-muted-foreground rounded-full px-1.5 font-mono mr-1.5 bg-input dark:bg-input/70">
              v{version}
            </span>
            <Separator orientation="vertical" />
            <span
              className={`mx-1.5 inline-block size-2.5 rounded-full ${isPublished ? 'bg-green-500' : 'bg-muted-foreground'}`}
            />
            {t('publishedVersion')}
          </>
        ) : (
          <>
            <span
              className={`mx-1.5 inline-block size-2.5 rounded-full ${isPublished ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            {t('draft')}
          </>
        )}
      </span>
    </div>
  );
}

interface PopoverBodyProps {
  agentSlug: string;
  orgSlug: string;
  tenants: PublishTenant[];
  selectedTenantId: string;
  onTenantChange: (tenantId: string) => void;
  version: number;
  publishing: boolean;
  onPublish: () => void;
}

interface PublishedDetailsProps {
  agentSlug: string;
  tenants: PublishTenant[];
  selectedTenantId: string;
  onTenantChange: (tenantId: string) => void;
  version: number;
  publishing: boolean;
}

function PublishedDetails(props: PublishedDetailsProps) {
  const { agentSlug, tenants, selectedTenantId, onTenantChange, version, publishing } = props;
  const showDetails = version > 0 || publishing;
  const curlVersion = version > 0 ? version : version + 1;
  const selectedSlug = (tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0])?.slug ?? '';

  if (!showDetails) return null;

  return (
    <>
      <TenantPicker
        tenants={tenants}
        selectedTenantId={selectedTenantId}
        onChange={onTenantChange}
        disabled={publishing}
      />
      <DirectLinkDisplay tenantSlug={selectedSlug} agentSlug={agentSlug} disabled={publishing} />
      <EmbedSnippetDisplay tenantSlug={selectedSlug} agentSlug={agentSlug} disabled={publishing} />
      <CurlDisplay agentSlug={agentSlug} version={curlVersion} publishing={publishing} />
    </>
  );
}

function PopoverBody(props: PopoverBodyProps) {
  const { agentSlug, orgSlug, tenants, selectedTenantId, onTenantChange, version, publishing, onPublish } =
    props;
  const t = useTranslations('editor');
  const hasTenants = tenants.length > 0;

  return (
    <div className="flex flex-col gap-3 p-0.5">
      <PublishStatus version={version} />
      <Separator />
      {hasTenants ? (
        <>
          <PublishedDetails
            agentSlug={agentSlug}
            tenants={tenants}
            selectedTenantId={selectedTenantId}
            onTenantChange={onTenantChange}
            version={version}
            publishing={publishing}
          />
          <Button variant="default" size="sm" className="w-full" onClick={onPublish} disabled={publishing}>
            {publishing ? <Loader2 className="size-4 animate-spin" /> : `${t('publish')} v${version + 1}`}
          </Button>
        </>
      ) : (
        <EmptyTenantsState orgSlug={orgSlug} />
      )}
    </div>
  );
}

function DisabledPublishButton() {
  const t = useTranslations('editor');
  const tKeys = useTranslations('apiKeys');

  const button = (
    <Button variant="default" size="default" disabled className="gap-1.5 px-3 rounded-full ml-2 mr-1.5">
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
  const { agentId, agentSlug, orgSlug, tenants, version, canPublish, hasApiKey, flush, onPublished } = props;
  const t = useTranslations('editor');
  const [publishing, setPublishing] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');

  async function handlePublish() {
    setPublishing(true);
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

  function handleOpenChange(next: boolean) {
    if (publishing) return;
    if (next) setSelectedTenantId(tenants[0]?.id ?? '');
    setOpen(next);
  }

  if (!canPublish || !hasApiKey) return <DisabledPublishButton />;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="default" size="default" className="gap-1.5 px-3 rounded-full pr-2 ml-2 mr-1.5" />}
      >
        {t('publish')}
        <ChevronDown className='size-4' />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" sideOffset={8} className="w-96">
        <PopoverBody
          agentSlug={agentSlug}
          orgSlug={orgSlug}
          tenants={tenants}
          selectedTenantId={selectedTenantId}
          onTenantChange={setSelectedTenantId}
          version={version}
          publishing={publishing}
          onPublish={handlePublish}
        />
      </PopoverContent>
    </Popover>
  );
}
