'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

function FileMenu({ onImport, onExport }: { onImport: () => void; onExport: () => void }) {
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
      <DropdownMenuContent side="bottom" align="start">
        <DropdownMenuItem onClick={onImport}>
          <Upload className="size-4" />
          Import
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExport}>
          <Download className="size-4" />
          Export
        </DropdownMenuItem>
        <Separator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="size-4" />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
}: ToolbarProps) {
  return (
    <>
      <div className="absolute top-2 left-2 z-1">
        <FileMenu onImport={onImport} onExport={onExport} />
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

      </header>
    </>
  );
}
