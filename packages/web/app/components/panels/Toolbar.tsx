'use client';

import { createClient } from '@/app/lib/supabase/client';
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
  ArrowLeft,
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

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

interface UserInfo {
  name: string;
  email: string;
}

function useCurrentUser(): UserInfo | null {
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user !== null) {
        setUser({
          name: (data.user.user_metadata?.full_name as string) ?? '',
          email: data.user.email ?? '',
        });
      }
    });
  }, []);

  return user;
}

function UserSection({ user }: { user: UserInfo | null }) {
  if (user === null) return null;

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          {user.name !== '' && <span className="text-xs font-medium">{user.name}</span>}
          <span className="text-muted-foreground text-xs truncate">{user.email}</span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
    </>
  );
}

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return <img src={avatarUrl} alt={name} className="h-5 w-5 rounded-full object-cover" />;
  }

  return (
    <div className="bg-muted flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium">
      {initial}
    </div>
  );
}

function OrgSection({ orgName, orgAvatarUrl }: { orgName: string; orgAvatarUrl: string | null }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel className="flex items-center gap-2 font-normal">
        <OrgAvatar name={orgName} avatarUrl={orgAvatarUrl} />
        <span className="text-xs font-bold text-black">{orgName}</span>
      </DropdownMenuLabel>
    </DropdownMenuGroup>
  );
}

interface FileMenuProps {
  onImport: () => void;
  onExport: () => void;
  user: UserInfo | null;
  orgSlug?: string;
  orgName?: string;
  orgAvatarUrl?: string | null;
}

function FileMenu({ onImport, onExport, user, orgSlug, orgName, orgAvatarUrl }: FileMenuProps) {
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
        <div className="p-2 mb-1 bg-gray-100 rounded-md">
          {orgName !== undefined && <OrgSection orgName={orgName} orgAvatarUrl={orgAvatarUrl ?? null} />}
          <UserSection user={user} />
        </div>
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
        {orgSlug !== undefined && (
          <DropdownMenuItem render={<Link href={`/orgs/${orgSlug}`} />}>
            <ArrowLeft className="size-4" />
            {t('backToAgents')}
          </DropdownMenuItem>
        )}
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
  const { onToggleGlobalPanel, onToggleTools, onTogglePresets, statusSlot, pendingSave, publishSlot } = props;

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
      {publishSlot}
    </>
  );
}

export function Toolbar(props: ToolbarProps) {
  const { onImport, onExport, onPlay, simulationActive, stagingKeyId, orgSlug, orgName, orgAvatarUrl } =
    props;
  const user = useCurrentUser();

  return (
    <>
      <div className="absolute top-2 left-2 z-1">
        <FileMenu
          onImport={onImport}
          onExport={onExport}
          user={user}
          orgSlug={orgSlug}
          orgName={orgName}
          orgAvatarUrl={orgAvatarUrl}
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
    </>
  );
}
