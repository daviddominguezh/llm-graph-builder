'use client';

import type { SearchResponse, SemanticChunk } from '@/app/lib/ragFiles';
import { useTranslations } from 'next-intl';

interface SearchResultsProps {
  response: SearchResponse | null;
}

const ZERO = 0;
const DISTANCE_PRECISION = 3;

function ChunkResult({ c }: { c: SemanticChunk }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  return (
    <div className="rounded-md border p-3 text-xs">
      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground mb-1">
        <span>{t('page', { page: c.page_number ?? ZERO })}</span>
        <span>·</span>
        <span>{t('paragraph', { idx: c.paragraph_idx ?? ZERO })}</span>
        {typeof c.distance === 'number' && (
          <>
            <span>·</span>
            <span>{t('distance', { d: c.distance.toFixed(DISTANCE_PRECISION) })}</span>
          </>
        )}
      </div>
      <p className="whitespace-pre-wrap">{c.content}</p>
    </div>
  );
}

function ChunkResults({ chunks }: { chunks: SemanticChunk[] }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  if (chunks.length === ZERO) {
    return <span className="text-xs text-muted-foreground">{t('empty')}</span>;
  }
  return (
    <div className="flex flex-col gap-2">
      {chunks.map((c) => (
        <ChunkResult key={c.id} c={c} />
      ))}
    </div>
  );
}

export function SearchResults({ response }: SearchResultsProps): React.JSX.Element | null {
  if (response === null) return null;
  return <ChunkResults chunks={response.chunks ?? []} />;
}
