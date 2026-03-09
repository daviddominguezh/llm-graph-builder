'use client';

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
import { createClient } from '@/app/lib/supabase/client';
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
  if (user === null) {
    return null;
  }

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          {user.name !== '' && <span className="text-xs font-medium">{user.name}</span>}
          <span className="text-muted-foreground text-xs">{user.email}</span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <Separator />
    </>
  );
}

interface FileMenuProps {
  onImport: () => void;
  onExport: () => void;
  user: UserInfo | null;
}

function FileMenu({ onImport, onExport, user }: FileMenuProps) {
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
        <UserSection user={user} />
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

  return (
    <span className="text-muted-foreground flex items-center px-2 text-xs">
      {t('saving')}
    </span>
  );
}

export function Toolbar({
  onImport,
  onExport,
  onPlay,
  simulationActive,
  statusSlot,
  onToggleGlobalPanel,
  onTogglePresets,
  onToggleTools,
  pendingSave,
  publishSlot,
}: ToolbarProps) {
  const user = useCurrentUser();

  return (
    <>
      <div className="absolute top-2 left-2 z-1">
        <FileMenu onImport={onImport} onExport={onExport} user={user} />
      </div>
      <header className="absolute z-1 flex items-stretch justify-center gap-1 border rounded-lg bg-background p-1 top-2 shadow-lg">
        <Button
          className="h-10 w-10"
          variant={simulationActive ? 'default' : 'ghost'}
          size="sm"
          onClick={onPlay}
        >
          <Play className="size-4" />
        </Button>
        <Button className="h-10 w-10" variant="ghost" size="sm">
          <WandSparkles className="size-4" />
        </Button>

        {onToggleGlobalPanel && (
          <>
            <Separator orientation="vertical" />
            <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onToggleGlobalPanel}>
              <Waypoints className="size-4" />
            </Button>
          </>
        )}

        {onToggleTools && (
          <>
            <Button className="h-10 w-10" variant="ghost" size="sm" onClick={onToggleTools}>
              <SquareFunction className="size-4" />
            </Button>
          </>
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
      </header>
    </>
  );
}
