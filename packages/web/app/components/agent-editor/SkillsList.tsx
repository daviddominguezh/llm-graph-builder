'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import type { SkillEntry } from './AddSkillDialog';
import { AddSkillDialog } from './AddSkillDialog';
import { SkillRow } from './SkillRow';

interface SkillsListProps {
  skills: SkillEntry[];
  onAdd: (entries: SkillEntry[]) => void;
  onDelete: (name: string) => void;
  onDeleteMany: (names: string[]) => void;
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

export function SkillsList({ skills, onAdd, onDelete, onDeleteMany }: SkillsListProps) {
  const t = useTranslations('agentEditor');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleBatchDelete = useCallback(() => {
    onDeleteMany([...selected]);
    setSelected(new Set());
    setConfirmBatchOpen(false);
  }, [selected, onDeleteMany]);

  const handleSingleDelete = useCallback(
    (name: string) => {
      onDelete(name);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    },
    [onDelete]
  );

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{t('skills')}</Label>
        <div className="flex items-center gap-1">
          {selectedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmBatchOpen(true)}
            >
              <Trash2 className="mr-1 size-3" />
              {t('removeSelected', { count: String(selectedCount) })}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 size-3" />
            {t('addSkill')}
          </Button>
        </div>
      </div>
      {skills.length === 0 && <EmptyState title={t('emptySkills')} description={t('skillsDescription')} />}
      <div className="flex flex-col gap-1">
        {skills.map((skill) => (
          <SkillRow
            key={skill.name}
            skill={skill}
            selected={selected.has(skill.name)}
            onToggleSelect={toggleSelect}
            onDelete={handleSingleDelete}
          />
        ))}
      </div>
      <AddSkillDialog open={dialogOpen} onOpenChange={setDialogOpen} onSkillsAdded={onAdd} />
      <AlertDialog open={confirmBatchOpen} onOpenChange={setConfirmBatchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('removeSelectedTitle', { count: String(selectedCount) })}</AlertDialogTitle>
            <AlertDialogDescription>{t('removeSelectedDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('removeSkillCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete}>{t('removeSkillConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
