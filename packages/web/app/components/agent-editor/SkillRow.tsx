'use client';

import '@/app/styles/starry-night.css';

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
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkGfm from 'remark-gfm';

import type { SkillEntry } from './AddSkillDialog';

interface SkillRowProps {
  skill: SkillEntry;
  selected: boolean;
  onToggleSelect: (name: string) => void;
  onDelete: (name: string) => void;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function SkillContent({ content }: { content: string }) {
  const body = stripFrontmatter(content);
  return (
    <div className="markdown-content max-h-64 overflow-y-auto rounded-md border bg-background p-3 text-xs leading-relaxed">
      <MarkdownHooks remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeStarryNight]}>
        {body}
      </MarkdownHooks>
    </div>
  );
}

function DeleteConfirmation({ open, onOpenChange, onConfirm }: DeleteConfirmationProps) {
  const t = useTranslations('agentEditor');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('removeSkillTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('removeSkillDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('removeSkillCancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('removeSkillConfirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DeleteConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function SkillRow({ skill, selected, onToggleSelect, onDelete }: SkillRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteConfirmed = useCallback(() => {
    setConfirmOpen(false);
    onDelete(skill.name);
  }, [skill.name, onDelete]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="group flex items-center gap-2.5 p-1 px-0">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(skill.name)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[10px] font-medium">{skill.name}</span>
          {skill.description !== '' && (
            <span className="truncate text-[10px] text-muted-foreground">{skill.description}</span>
          )}
        </div>
      </div>
      {expanded && <SkillContent content={skill.content} />}
      <DeleteConfirmation open={confirmOpen} onOpenChange={setConfirmOpen} onConfirm={handleDeleteConfirmed} />
    </div>
  );
}
