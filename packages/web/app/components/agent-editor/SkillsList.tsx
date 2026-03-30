'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Plus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import React from 'react';

import type { SkillEntry } from './AddSkillDialog';
import { AddSkillDialog } from './AddSkillDialog';
import { SkillRow } from './SkillRow';

interface SkillsListProps {
  skills: SkillEntry[];
  onAdd: (entries: SkillEntry[]) => void;
  onDelete: (name: string) => void;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-ring/50 bg-input/20 py-6 text-center">
      <Sparkles className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="max-w-xs text-[11px] text-muted-foreground/70">{description}</p>
    </div>
  );
}

export function SkillsList({ skills, onAdd, onDelete }: SkillsListProps) {
  const t = useTranslations('agentEditor');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleSkillsAdded = useCallback(
    (entries: SkillEntry[]) => {
      onAdd(entries);
    },
    [onAdd]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{t('skills')}</Label>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 size-3" />
          {t('addSkill')}
        </Button>
      </div>
      {skills.length === 0 && <EmptyState title={t('emptySkills')} description={t('skillsDescription')} />}
      <div className="flex flex-col gap-1.5 border-l-2 border-accent/20 pl-4">
        {skills.map((skill, i) => (
          <React.Fragment key={skill.name}>
            <SkillRow skill={skill} onDelete={onDelete} />
            {i < skills.length - 1 && <Separator className="ml-7 max-w-[calc(100%-var(--spacing)*7)]" />}
          </React.Fragment>
        ))}
      </div>
      <AddSkillDialog open={dialogOpen} onOpenChange={setDialogOpen} onSkillsAdded={handleSkillsAdded} />
    </div>
  );
}
