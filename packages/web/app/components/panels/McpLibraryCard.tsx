'use client';

import { Download, Server } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import type { McpLibraryRow } from '@/app/lib/mcp-library-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface McpLibraryCardProps {
  item: McpLibraryRow;
  isInstalled: boolean;
  onInstall: (item: McpLibraryRow) => void;
}

function CardImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  if (imageUrl !== null) {
    return (
      <Image src={imageUrl} alt={name} width={40} height={40} className="size-10 rounded object-cover" unoptimized />
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded bg-gray-100">
      <Server className="size-5 text-gray-400" />
    </div>
  );
}

interface CardHeaderProps {
  item: McpLibraryRow;
  isInstalled: boolean;
  onInstall: (item: McpLibraryRow) => void;
}

function CardHeader({ item, isInstalled, onInstall }: CardHeaderProps) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        {item.org_name !== undefined && (
          <p className="truncate text-xs text-muted-foreground">{item.org_name}</p>
        )}
      </div>
      <Button size="sm" variant={isInstalled ? 'outline' : 'default'} disabled={isInstalled} onClick={() => onInstall(item)}>
        {isInstalled ? t('installed') : t('install')}
      </Button>
    </div>
  );
}

function CardMeta({ item }: { item: McpLibraryRow }) {
  const t = useTranslations('mcpLibrary');

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-xs">
        {item.category}
      </Badge>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Download className="size-3" />
        {t('installations', { count: item.installations_count })}
      </span>
    </div>
  );
}

export function McpLibraryCard({ item, isInstalled, onInstall }: McpLibraryCardProps) {
  return (
    <div className="flex flex-col gap-2 border p-3 mx-3 rounded-md mt-1">
      <div className="flex items-start gap-3">
        <CardImage imageUrl={item.image_url} name={item.name} />
        <CardHeader item={item} isInstalled={isInstalled} onInstall={onInstall} />
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      <CardMeta item={item} />
    </div>
  );
}
