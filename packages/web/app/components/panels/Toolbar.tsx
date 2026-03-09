'use client';

import { createClient } from '@/app/lib/supabase/client';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Download,
  LogOut,
  Menu,
  Play,
  SlidersHorizontal,
  SquareFunction,
  Upload,
  WandSparkles,
  Waypoints,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

interface ToolbarProps {
  onAddNode: () => void;
  onImport: () => void;
  onExport: () => void;
  onPlay?: () => void;
  simulationActive?: boolean;
  statusSlot?: ReactNode;
  globalPanelOpen?: boolean;
  onToggleGlobalPanel?: () => void;
  onTogglePresets?: () => void;
  onToggleTools?: () => void;
  pendingSave?: boolean;
  publishSlot?: ReactNode;
  stagingKeyId?: string | null;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  agentName?: string;
}

function useLogout() {
  const router = useRouter();

  return async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };
}



function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return <Image src={toProxyImageSrc(avatarUrl)} alt={name} width={20} height={20} className="h-5 w-5 rounded-full ring-1 ring-white object-cover" />;
  }

  return (
    <div className="bg-muted flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium ring-1 ring-white">
      {initial}
    </div>
  );
}

interface OrgSectionProps {
  orgName: string;
  orgAvatarUrl: string | null;
  orgSlug: string;
  agentName: string;
}

function OrgSection({ orgName, orgAvatarUrl, orgSlug, agentName }: OrgSectionProps) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-1.5 font-normal">
        <OrgAvatar name={orgName} avatarUrl={orgAvatarUrl} />
        <Link href={`/orgs/${orgSlug}`} className="text-xs font-bold text-black hover:underline">
          {orgName}
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <span className="text-xs text-black">{agentName}</span>
      </DropdownMenuLabel>
    </DropdownMenuGroup>
  );
}

interface FileMenuProps {
  onImport: () => void;
  onExport: () => void;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  agentName?: string;
}

function FileMenu({ onImport, onExport, orgSlug, orgName, orgAvatarUrl, agentName }: FileMenuProps) {
  const t = useTranslations('common');
  const handleLogout = useLogout();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="h-9 w-9 bg-white" variant="outline" size="sm">
            <Menu className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent side="bottom" align="start" className="w-52">
        {orgName !== undefined && orgSlug !== undefined && agentName !== undefined && (
          <OrgSection
            orgName={orgName}
            orgAvatarUrl={orgAvatarUrl ?? null}
            orgSlug={orgSlug}
            agentName={agentName}
          />
        )}
        <Separator />
        <div className="py-1">
          <DropdownMenuItem onClick={onImport}>
            <Upload className="size-4" />
            {t('import')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExport}>
            <Download className="size-4" />
            {t('export')}
          </DropdownMenuItem>
        </div>
        <Separator />
        <div className="pt-1">
          <DropdownMenuItem onClick={handleLogout} className="text-destructive">
            <LogOut className="size-4" />
            {t('logout')}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SaveIndicator({ pendingSave }: { pendingSave: boolean }) {
  const t = useTranslations('editor');

  if (!pendingSave) return null;

  return <span className="text-muted-foreground flex items-center px-2 text-xs">{t('saving')}</span>;
}

function PlayButton({
  simulationActive,
  onPlay,
  disabled,
}: {
  simulationActive: boolean;
  onPlay?: () => void;
  disabled: boolean;
}) {
  const t = useTranslations('apiKeys');

  const button = (
    <Button
      className="h-10 w-10"
      variant={simulationActive ? 'default' : 'ghost'}
      size="sm"
      onClick={disabled ? undefined : onPlay}
      disabled={disabled}
    >
      <Play className="size-4" />
    </Button>
  );

  if (!disabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>{button}</TooltipTrigger>
      <TooltipContent>{t('requiresKey')}</TooltipContent>
    </Tooltip>
  );
}

function ToolbarButtons(props: ToolbarProps) {
  const { onToggleGlobalPanel, onToggleTools, onTogglePresets, statusSlot, pendingSave } = props;

  return (
    <>
      {onToggleGlobalPanel && (
        <>
          <Separator orientation="vertical" />
          <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onToggleGlobalPanel}>
            <Waypoints className="size-4" />
          </Button>
        </>
      )}
      {onToggleTools && (
        <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onToggleTools}>
          <SquareFunction className="size-4" />
        </Button>
      )}
      {onTogglePresets && (
        <>
          <Separator orientation="vertical" />
          <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onTogglePresets}>
            <SlidersHorizontal className="size-4" />
          </Button>
        </>
      )}
      {statusSlot && (
        <>
          <Separator orientation="vertical" />
          {statusSlot}
        </>
      )}
      {pendingSave !== undefined && <SaveIndicator pendingSave={pendingSave} />}
    </>
  );
}

export function Toolbar(props: ToolbarProps) {
  const {
    onImport,
    onExport,
    onPlay,
    simulationActive,
    stagingKeyId,
    orgSlug,
    orgName,
    orgAvatarUrl,
    agentName,
  } = props;
  return (
    <>
      <div className="absolute top-2 left-2 z-1">
        <FileMenu
          onImport={onImport}
          onExport={onExport}
          orgSlug={orgSlug}
          orgName={orgName}
          orgAvatarUrl={orgAvatarUrl}
          agentName={agentName}
        />
      </div>
      <header className="absolute z-1 flex items-stretch justify-center gap-1 border rounded-lg bg-background p-1 top-2 shadow-lg">
        <PlayButton
          simulationActive={simulationActive ?? false}
          onPlay={onPlay}
          disabled={stagingKeyId === null || stagingKeyId === undefined}
        />
        <Button className="h-10 w-10" variant="ghost" size="sm">
          <WandSparkles className="size-4" />
        </Button>
        <ToolbarButtons {...props} />
      </header>
      {props.publishSlot && <div className="absolute top-2 right-2 z-1">{props.publishSlot}</div>}
    </>
  );
}
