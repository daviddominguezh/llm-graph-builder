'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Eye, GitFork, Network, Puzzle } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { TemplateListItem } from '@/app/lib/templates';

import { TemplateVersionSelector } from './TemplateVersionSelector';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function OrgAvatar({ url, slug }: { url: string | null; slug: string }) {
  const fallback = slug.charAt(0).toUpperCase();

  if (url) {
    return (
      <Image
        src={url}
        alt={slug}
        width={20}
        height={20}
        className="size-5 shrink-0 rounded-full object-cover"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
      aria-hidden="true"
    >
      {fallback}
    </div>
  );
}

function StatItem({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground" aria-label={`${value} ${label}`}>
      {icon}
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

export interface TemplateCardProps {
  template: TemplateListItem;
  selected: boolean;
  onSelect: () => void;
  onPreview: () => void;
  selectedVersion: number;
  onVersionChange: (version: number) => void;
  versions: number[];
}

/* ------------------------------------------------------------------ */
/*  Header row                                                          */
/* ------------------------------------------------------------------ */

function TemplateCardHeader({ template }: { template: TemplateListItem }) {
  const tc = useTranslations('categories');

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <OrgAvatar url={template.org_avatar_url} slug={template.org_slug} />
      <span className="truncate text-xs font-medium text-foreground">
        {template.org_slug}/{template.agent_slug}
      </span>
      <Badge variant="secondary" className="ml-auto shrink-0">
        {tc(template.category)}
      </Badge>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats row                                                           */
/* ------------------------------------------------------------------ */

interface TemplateCardStatsProps {
  template: TemplateListItem;
  versions: number[];
  selectedVersion: number;
  onVersionChange: (version: number) => void;
  onPreview: () => void;
}

function TemplateCardStats({
  template,
  versions,
  selectedVersion,
  onVersionChange,
  onPreview,
}: TemplateCardStatsProps) {
  const t = useTranslations('marketplace');

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <StatItem icon={<Network className="size-3" />} value={template.node_count} label={t('nodes')} />
        <StatItem icon={<Puzzle className="size-3" />} value={template.mcp_server_count} label={t('mcpServers')} />
        <StatItem icon={<Download className="size-3" />} value={template.download_count} label={t('downloads')} />
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <TemplateVersionSelector
          versions={versions}
          value={selectedVersion}
          onValueChange={onVersionChange}
        />
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          aria-label={t('preview')}
        >
          <Eye className="size-3" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TemplateCard                                                        */
/* ------------------------------------------------------------------ */

function cardBorderClass(selected: boolean): string {
  if (selected) return 'border-primary ring-1 ring-primary';
  return 'border-border';
}

export function TemplateCard({
  template,
  selected,
  onSelect,
  onPreview,
  selectedVersion,
  onVersionChange,
  versions,
}: TemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-[background-color,border-color,box-shadow] duration-150 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${cardBorderClass(selected)}`}
    >
      <TemplateCardHeader template={template} />
      <p className="line-clamp-2 text-[11px] text-muted-foreground">{template.description}</p>
      <TemplateCardStats
        template={template}
        versions={versions}
        selectedVersion={selectedVersion}
        onVersionChange={onVersionChange}
        onPreview={onPreview}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  BlankCanvasCard                                                     */
/* ------------------------------------------------------------------ */

function blankBorderClass(selected: boolean): string {
  if (selected) return 'border-primary ring-1 ring-primary border-solid';
  return 'border-dashed border-border';
}

export function BlankCanvasCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  const t = useTranslations('marketplace');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center transition-[background-color,border-color,box-shadow] duration-150 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${blankBorderClass(selected)}`}
    >
      <GitFork className="size-5 text-muted-foreground" aria-hidden="true" />
      <span className="text-xs font-medium text-foreground">{t('blankCanvas')}</span>
      <p className="text-[11px] text-muted-foreground">{t('blankCanvasDescription')}</p>
    </button>
  );
}
