'use client';

import { Database, Table } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { StoreType } from './CreateStoreDialog';

interface StoreTypeCardsProps {
  value: StoreType | null;
  onChange: (type: StoreType | null) => void;
}

interface StoreTypeCardProps {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function StoreTypeCard({
  selected,
  onClick,
  icon,
  label,
  description,
}: StoreTypeCardProps): React.JSX.Element {
  const active = selected
    ? 'bg-background hover:bg-background! dark:hover:bg-input/30 dark:bg-input/30! border-primary'
    : 'bg-transparent dark:bg-transparent border-border';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 h-[82px] cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-[border-color,box-shadow,transform] duration-150 dark:hover:bg-input/30 hover:bg-input ${active}`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}

export function StoreTypeCards({ value, onChange }: StoreTypeCardsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.create');
  return (
    <div className="w-full flex gap-3">
      <StoreTypeCard
        selected={value === 'rag'}
        onClick={() => onChange(value === 'rag' ? null : 'rag')}
        icon={
          <Database
            className={`size-3.5 transition-colors duration-150 ${value === 'rag' ? 'text-primary' : 'text-muted-foreground'}`}
          />
        }
        label={t('typeRag')}
        description={t('typeRagDescription')}
      />
      <StoreTypeCard
        selected={value === 'kv'}
        onClick={() => onChange(value === 'kv' ? null : 'kv')}
        icon={
          <Table
            className={`size-3.5 transition-colors duration-150 ${value === 'kv' ? 'text-primary' : 'text-muted-foreground'}`}
          />
        }
        label={t('typeKv')}
        description={t('typeKvDescription')}
      />
    </div>
  );
}
