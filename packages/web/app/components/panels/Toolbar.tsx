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
import { TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import {
  AlignHorizontalSpaceAround,
  Download,
  LogOut,
  Menu,
  Play,
  Settings,
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

const TOOLTIP_DELAY = 1000;

interface ToolbarProps {
  onAddNode: () => void;
  onImport: () => void;
  onExport: () => void;
  onFormat: () => void;
  onPlay?: () => void;
  simulationActive?: boolean;
  statusSlot?: ReactNode;
  globalPanelOpen?: boolean;
  onToggleGlobalPanel?: () => void;
  onTogglePresets?: () => void;
  onToggleTools?: () => void;
  publishSlot?: ReactNode;
  versionSlot?: ReactNode;
  stagingKeyId?: string | null;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  agentName?: string;
}

function ToolbarTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider delay={TOOLTIP_DELAY}>
      <TooltipPrimitive.Root>
        <TooltipTrigger render={<span />}>{children}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipProvider>
  );
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
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={20}
        height={20}
        className="h-5 w-5 rounded-full object-cover ring-1 ring-white"
      />
    );
  }

  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-1 ring-white">
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
        <span className="text-xs text-muted-foreground">/</span>
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

function PlayButton({ simulationActive, onPlay, disabled, label }: PlayButtonProps) {
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

  if (disabled) {
    return <ToolbarTooltip label={t('requiresKey')}>{button}</ToolbarTooltip>;
  }

  return <ToolbarTooltip label={label}>{button}</ToolbarTooltip>;
}

interface PlayButtonProps {
  simulationActive: boolean;
  onPlay?: () => void;
  disabled: boolean;
  label: string;
}

function ToolbarButtons(props: ToolbarProps) {
  const { onFormat, onToggleGlobalPanel, onToggleTools, onTogglePresets } = props;
  const t = useTranslations('toolbar');

  return (
    <>
      {onToggleGlobalPanel && (
        <ToolbarTooltip label={t('globalNodes')}>
          <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onToggleGlobalPanel}>
            <Waypoints className="size-4" />
          </Button>
        </ToolbarTooltip>
      )}
      {onToggleTools && (
        <ToolbarTooltip label={t('tools')}>
          <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onToggleTools}>
            <SquareFunction className="size-4" />
          </Button>
        </ToolbarTooltip>
      )}
      <ToolbarTooltip label={t('autoLayout')}>
        <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onFormat}>
          <AlignHorizontalSpaceAround className="size-4" />
        </Button>
      </ToolbarTooltip>
      {onTogglePresets && (
        <>
          <Separator orientation="vertical" />
          <ToolbarTooltip label={t('settings')}>
            <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onTogglePresets}>
              <Settings className="size-4" />
            </Button>
          </ToolbarTooltip>
        </>
      )}
    </>
  );
}

export function Toolbar(props: ToolbarProps) {
  const { onImport, onExport, onPlay, simulationActive, stagingKeyId, orgSlug, orgName, orgAvatarUrl, agentName } =
    props;
  const t = useTranslations('toolbar');
  return (
    <>
      <div className="absolute top-0 left-2 z-1">
        <FileMenu
          onImport={onImport}
          onExport={onExport}
          orgSlug={orgSlug}
          orgName={orgName}
          orgAvatarUrl={orgAvatarUrl}
          agentName={agentName}
        />
      </div>
      <header className="absolute z-1 flex items-stretch justify-center gap-1 rounded-lg border bg-background p-1 top-0 shadow-lg">
        <ToolbarTooltip label={t('status')}>{props.statusSlot}</ToolbarTooltip>
        <Separator orientation="vertical" />
        <PlayButton
          simulationActive={simulationActive ?? false}
          onPlay={onPlay}
          disabled={stagingKeyId === null || stagingKeyId === undefined}
          label={t('simulate')}
        />
        <Separator orientation="vertical" />
        <ToolbarTooltip label={t('generate')}>
          <Button className="h-10 w-10" variant="ghost" size="sm">
            <WandSparkles className="size-4" />
          </Button>
        </ToolbarTooltip>
        <ToolbarButtons {...props} />
      </header>
      {(props.publishSlot ?? props.versionSlot) && (
        <div className="absolute top-0 right-2 z-1 flex items-center gap-2">
          {props.versionSlot}
          {props.publishSlot}
        </div>
      )}
    </>
  );
}
