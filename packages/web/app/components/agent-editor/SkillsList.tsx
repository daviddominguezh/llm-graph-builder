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
import { useCallback, useMemo, useState } from 'react';

import type { SkillEntry } from './AddSkillDialog';
import { AddSkillDialog } from './AddSkillDialog';
import { SkillRow } from './SkillRow';

interface SkillsListProps {
  skills: SkillEntry[];
  onAdd: (entries: SkillEntry[]) => void;
  onDelete: (name: string) => void;
  onDeleteMany: (names: string[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-ring/50 bg-input/20 py-6 text-center">
      <Sparkles className="size-5 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="max-w-xs text-[11px] text-muted-foreground/70">{description}</p>
    </div>
  );
}

function extractRepoName(repoUrl: string): string {
  const match = repoUrl.match(/github\.com\/[^/]+\/([^/]+)/);
  if (match?.[1]) return match[1].replace(/\.git$/, '');
  return repoUrl;
}

interface ProviderGroup {
  repoUrl: string;
  repoName: string;
  skills: SkillEntry[];
}

function groupByProvider(skills: SkillEntry[]): ProviderGroup[] {
  const map = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    const key = skill.repoUrl || 'unknown';
    const arr = map.get(key) ?? [];
    arr.push(skill);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([repoUrl, items]) => ({
    repoUrl,
    repoName: extractRepoName(repoUrl),
    skills: items,
  }));
}

/* ------------------------------------------------------------------ */
/*  Provider tab bar                                                   */
/* ------------------------------------------------------------------ */

function ProviderTab({ label, count, active, onClick }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 h-full px-2 text-[11px] font-semibold transition-colors relative flex items-center gap-1 cursor-pointer ${
        active
          ? 'text-primary shadow-[inset_0_-2px_0_0_var(--color-primary)]'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span className="text-[10px] font-normal text-muted-foreground/60">{count}</span>
    </button>
  );
}

function ProviderTabBar({ providers, activeUrl, onSelect }: {
  providers: ProviderGroup[];
  activeUrl: string;
  onSelect: (url: string) => void;
}) {
  return (
    <div className="flex h-7 items-stretch overflow-x-auto border-b" style={{ scrollbarWidth: 'none' }}>
      {providers.map((g) => (
        <ProviderTab
          key={g.repoUrl}
          label={g.repoName}
          count={g.skills.length}
          active={g.repoUrl === activeUrl}
          onClick={() => onSelect(g.repoUrl)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function SkillsList({ skills, onAdd, onDelete, onDeleteMany }: SkillsListProps) {
  const t = useTranslations('agentEditor');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBatchOpen, setConfirmBatchOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState('');

  const providers = useMemo(() => groupByProvider(skills), [skills]);
  const resolvedActive = providers.find((g) => g.repoUrl === activeProvider) ?? providers[0];
  const activeSkills = resolvedActive?.skills ?? [];

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
      {providers.length > 0 && (
        <>
          <ProviderTabBar
            providers={providers}
            activeUrl={resolvedActive?.repoUrl ?? ''}
            onSelect={setActiveProvider}
          />
          <div className="flex flex-col gap-1">
            {activeSkills.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                selected={selected.has(skill.name)}
                onToggleSelect={toggleSelect}
                onDelete={handleSingleDelete}
              />
            ))}
          </div>
        </>
      )}
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
