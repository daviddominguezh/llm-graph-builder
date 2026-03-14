'use client';

import { Download, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import type { McpLibraryRow } from '@/app/lib/mcp-library-types';
import { Button } from '@/components/ui/button';

interface McpLibraryCardProps {
  item: McpLibraryRow;
  isInstalled: boolean;
  onInstall: (item: McpLibraryRow) => void;
}

function CardImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl !== null) {
    return (
      <Image src={imageUrl} alt={name} width={30} height={30} className="size-8 rounded object-cover" unoptimized />
    );
  }

  return (
    <div className="flex size-8 items-center justify-center rounded bg-gray-100">
      <Server className="size-4 text-gray-400" />
    </div>
  );
}

function CardInfo({ item }: { item: McpLibraryRow }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="truncate text-xs font-medium">{item.name}</p>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
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

function CardFooter({ item, isInstalled, onInstall }: McpLibraryCardProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex justify-end">
      <Button size="sm" variant={isInstalled ? 'outline' : 'default'} disabled={isInstalled} onClick={() => onInstall(item)}>
        {isInstalled ? t('installed') : t('install')}
      </Button>
    </div>
  );
}

export function McpLibraryCard({ item, isInstalled, onInstall }: McpLibraryCardProps) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-primary pl-2 mx-2 mt-2">
      <div className="flex items-start gap-2">
        <CardImage imageUrl={item.image_url} name={item.name} />
        <CardInfo item={item} />
      </div>
      <p className="line-clamp-2 text-[10px] text-muted-foreground">{item.description}</p>
      <CardFooter item={item} isInstalled={isInstalled} onInstall={onInstall} />
    </div>
  );
}
