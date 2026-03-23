'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { ExecutionSummaryRow } from '@/app/lib/dashboard';

interface ExecutionTimelineProps {
  executions: ExecutionSummaryRow[];
  selectedId: string;
  onSelect: (executionId: string) => void;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function statusVariant(status: string): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (status === 'completed') return 'secondary';
  if (status === 'failed') return 'destructive';
  return 'outline';
}

function ExecutionButton({
  execution,
  index,
  isSelected,
  label,
  onSelect,
}: {
  execution: ExecutionSummaryRow;
  index: number;
  isSelected: boolean;
  label: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Button
      variant={isSelected ? 'default' : 'outline'}
      size="sm"
      className="shrink-0"
      onClick={() => onSelect(execution.id)}
    >
      <span className="mr-1">{label.replace('{n}', String(index + 1))}</span>
      <span className="text-xs opacity-70">{formatTimestamp(execution.started_at)}</span>
      <Badge variant={statusVariant(execution.status)} className="ml-1.5 text-[10px]">
        {execution.status}
      </Badge>
    </Button>
  );
}

export function ExecutionTimeline({ executions, selectedId, onSelect }: ExecutionTimelineProps) {
  const t = useTranslations('dashboard.debug');

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {executions.map((ex, i) => (
        <ExecutionButton
          key={ex.id}
          execution={ex}
          index={i}
          isSelected={ex.id === selectedId}
          label={t('executionN')}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
