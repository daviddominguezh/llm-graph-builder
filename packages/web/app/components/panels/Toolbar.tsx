'use client';

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
  Blocks,
  Download,
  Menu,
  Palette,
  Play,
  Settings,
  SquareFunction,
  Upload,
  Waypoints,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { ThemeSwitcher } from '../ThemeSwitcher';

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
  onToggleLibrary?: () => void;
  publishSlot?: ReactNode;
  versionSlot?: ReactNode;
  stagingKeyId?: string | null;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  agentName?: string;
  hideWorkflowActions?: boolean;
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

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={20}
        height={20}
        className="h-5 w-5 rounded-full object-cover border"
      />
    );
  }

  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-1 ring-background">
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
        <Link href={`/orgs/${orgSlug}`} className="text-xs font-bold text-foreground hover:underline">
          {orgName}
        </Link>
        <span className="text-xs text-muted-foreground cursor-default">/</span>
        <span className="text-xs text-foreground cursor-default">{agentName}</span>
      </DropdownMenuLabel>
    </DropdownMenuGroup>
  );
}

interface FileMenuItemsProps {
  onImport: () => void;
  onExport: () => void;
  onFormat: () => void;
  hideWorkflowActions?: boolean;
}

function FileMenuItems({ onImport, onExport, onFormat, hideWorkflowActions }: FileMenuItemsProps) {
  const t = useTranslations('common');
  const tToolbar = useTranslations('toolbar');
  const tTheme = useTranslations('theme');

  return (
    <>
      <div className="flex items-center justify-between pl-2 pr-1 py-1.5">
        <span className="text-xs/relaxed flex gap-2 items-center cursor-default">
          <Palette className="size-4" />
          {tTheme('label')}
        </span>
        <ThemeSwitcher />
      </div>
      <Separator />
      <div className="pt-1">
        <DropdownMenuItem onClick={onImport}>
          <Upload className="size-4" />
          {t('import')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="size-4" />
          {t('export')}
        </DropdownMenuItem>
        {!hideWorkflowActions && (
          <DropdownMenuItem onClick={onFormat}>
            <AlignHorizontalSpaceAround className="size-4" />
            {tToolbar('autoLayout')}
          </DropdownMenuItem>
        )}
      </div>
    </>
  );
}

interface FileMenuProps {
  onImport: () => void;
  onExport: () => void;
  onFormat: () => void;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
  agentName?: string;
  hideWorkflowActions?: boolean;
}

function FileMenu({
  onImport,
  onExport,
  onFormat,
  orgSlug,
  orgName,
  orgAvatarUrl,
  agentName,
  hideWorkflowActions,
}: FileMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="h-9 w-9 bg-background! hover:bg-card!" variant="outline" size="sm">
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
        <FileMenuItems
          onImport={onImport}
          onExport={onExport}
          onFormat={onFormat}
          hideWorkflowActions={hideWorkflowActions}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlayButton({ simulationActive, onPlay, disabled, label }: PlayButtonProps) {
  const t = useTranslations('apiKeys');

  const button = (
    <Button
      className="hover:bg-card! aspect-square! px-0"
      variant={simulationActive ? 'default' : 'ghost'}
      size="lg"
      onClick={disabled ? undefined : onPlay}
      disabled={disabled}
    >
      <Play />
    </Button>
  );

  if (disabled) {
    return <ToolbarTooltip label={t('requiresStagingKey')}>{button}</ToolbarTooltip>;
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
  const { onToggleGlobalPanel, onToggleTools, onToggleLibrary, onTogglePresets } = props;
  const t = useTranslations('toolbar');

  return (
    <>
      {!props.hideWorkflowActions && onToggleGlobalPanel && (
        <ToolbarTooltip label={t('globalNodes')}>
          <Button
            className="hover:bg-card! aspect-square! px-0"
            variant="ghost"
            size="lg"
            onClick={onToggleGlobalPanel}
          >
            <Waypoints />
          </Button>
        </ToolbarTooltip>
      )}
      {onToggleTools && (
        <ToolbarTooltip label={t('tools')}>
          <Button
            className="hover:bg-card! aspect-square! px-0"
            variant="ghost"
            size="lg"
            onClick={onToggleTools}
          >
            <SquareFunction />
          </Button>
        </ToolbarTooltip>
      )}
      {onToggleLibrary && (
        <ToolbarTooltip label={t('mcpLibrary')}>
          <Button
            className="hover:bg-card! aspect-square! px-0"
            variant="ghost"
            size="lg"
            onClick={onToggleLibrary}
          >
            <Blocks />
          </Button>
        </ToolbarTooltip>
      )}
      {onTogglePresets && (
        <>
          <ToolbarTooltip label={t('settings')}>
            <Button
              className="hover:bg-card! aspect-square! px-0"
              variant="ghost"
              size="lg"
              onClick={onTogglePresets}
            >
              <Settings />
            </Button>
          </ToolbarTooltip>
        </>
      )}
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
  const t = useTranslations('toolbar');
  return (
    <>
      <div className={`absolute top-1 left-1 z-1 ${props.hideWorkflowActions === true ? 'top-2.5' : ''}`}>
        <FileMenu
          onImport={onImport}
          onExport={onExport}
          onFormat={props.onFormat}
          orgSlug={orgSlug}
          orgName={orgName}
          orgAvatarUrl={orgAvatarUrl}
          agentName={agentName}
          hideWorkflowActions={props.hideWorkflowActions}
        />
      </div>
      <header
        className={`absolute z-1 flex items-stretch justify-center gap-1.5 rounded-full border border-[0.5px] bg-background p-1 top-1 ${props.hideWorkflowActions === true ? '' : 'shadow-sm'}`}
      >
        <PlayButton
          simulationActive={simulationActive ?? false}
          onPlay={onPlay}
          disabled={stagingKeyId === null || stagingKeyId === undefined}
          label={t('simulate')}
        />
        <ToolbarButtons {...props} />
      </header>
      {(props.statusSlot ?? props.publishSlot ?? props.versionSlot) && (
        <div
          className={`absolute top-1 right-1 z-1 flex items-center gap-1  ${props.hideWorkflowActions === true ? 'top-2.5' : ''}`}
        >
          {props.statusSlot}
          {props.versionSlot}
          {props.publishSlot}
        </div>
      )}
    </>
  );
}
