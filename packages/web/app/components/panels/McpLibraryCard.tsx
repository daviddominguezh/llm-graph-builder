'use client';

import type { McpLibraryRow } from '@/app/lib/mcp-library-types';
import { Button } from '@/components/ui/button';
import { Check, Download, Server } from 'lucide-react';
import Image from 'next/image';

interface McpLibraryCardProps {
  item: McpLibraryRow;
  isInstalled: boolean;
  onInstall: (item: McpLibraryRow) => void;
}

function CardImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl !== null) {
    return (
      <Image
        src={imageUrl}
        alt={name}
        width={18}
        height={18}
        className="size-7 rounded object-cover"
        unoptimized
      />
    );
  }

  return (
    <div className="flex size-8 items-center justify-center rounded bg-muted">
      <Server className="size-4 text-muted-foreground" />
    </div>
  );
}

function CardInfo({ item }: { item: McpLibraryRow }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <p className="truncate text-xs font-medium">{item.name}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        {item.org_name !== undefined && <span className="truncate">{item.org_name}</span>}
        {item.org_name !== undefined && <span>·</span>}
        <span className="flex items-center gap-0.5">
          <Download className="size-2.5" />
          {item.installations_count}
        </span>
      </div>
    </div>
  );
}

function InstallButton({ isInstalled, onInstall }: { isInstalled: boolean; onInstall: () => void }) {
  return (
    <Button
      size="icon-xs"
      variant={isInstalled ? 'outline' : 'default'}
      disabled={isInstalled}
      onClick={onInstall}
      className="shrink-0"
    >
      {isInstalled ? <Check className="size-2.5" /> : <Download className="size-2.5" />}
    </Button>
  );
}

export function McpLibraryCard({ item, isInstalled, onInstall }: McpLibraryCardProps) {
  return (
    <div className="flex flex-col gap-1 border-b mx-2 mt-2 pb-2 px-2 first:mt-0.5">
      <div className="flex items-start gap-2">
        <CardImage imageUrl={item.image_url} name={item.name} />
        <CardInfo item={item} />
        <InstallButton isInstalled={isInstalled} onInstall={() => onInstall(item)} />
      </div>
      <p className="line-clamp-2 text-[10px] text-muted-foreground">{item.description}</p>
    </div>
  );
}
