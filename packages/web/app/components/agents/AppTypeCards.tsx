'use client';

import { Bot, GitFork } from 'lucide-react';
import { useTranslations } from 'next-intl';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AppType = 'workflow' | 'agent';

interface AppTypeCardsProps {
  value: AppType | null;
  onChange: (type: AppType | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

function AppTypeCard({
  selected,
  onClick,
  icon,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  const border = selected ? 'border-primary ring-1 ring-primary border-solid' : 'border-border';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[82px] cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-[border-color,box-shadow,transform] duration-150 bg-background hover:bg-card/60 hover:shadow-sm border-dashed ${border}`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  AppTypeCards                                                        */
/* ------------------------------------------------------------------ */

export function AppTypeCards({ value, onChange }: AppTypeCardsProps) {
  const t = useTranslations('marketplace');

  return (
    <div className="flex gap-2">
      <AppTypeCard
        selected={value === 'workflow'}
        onClick={() => onChange(value === 'workflow' ? null : 'workflow')}
        icon={<GitFork className={`size-3.5 transition-colors duration-150 ${value === 'workflow' ? 'text-primary' : 'text-muted-foreground'}`} />}
        label={t('typeWorkflow')}
        description={t('typeWorkflowDescription')}
      />
      <AppTypeCard
        selected={value === 'agent'}
        onClick={() => onChange(value === 'agent' ? null : 'agent')}
        icon={<Bot className={`size-3.5 transition-colors duration-150 ${value === 'agent' ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'}`} />}
        label={t('typeAgent')}
        description={t('typeAgentDescription')}
      />
    </div>
  );
}
