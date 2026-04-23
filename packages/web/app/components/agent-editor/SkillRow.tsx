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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

import type { SkillEntry } from './AddSkillDialog';

interface SkillRowProps {
  skill: SkillEntry;
  selected: boolean;
  onToggleSelect: (name: string, shiftKey: boolean) => void;
  onDelete: (name: string) => void;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function SkillPreviewDialog({
  skill,
  open,
  onOpenChange,
}: {
  skill: SkillEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const body = stripFrontmatter(skill.content);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex sm:max-w-4xl flex-col max-h-[80vh] gap-0">
        <DialogHeader className="border-b pb-2.5">
          <DialogTitle className="text-sm font-mono">{skill.name.toUpperCase()}</DialogTitle>
          {skill.description !== '' && (
            <p className="text-xs text-muted-foreground bg-card border p-2 rounded-md">{skill.description}</p>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="markdown-content text-xs leading-relaxed">
            <MarkdownHooks remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeStarryNight]}>
              {body}
            </MarkdownHooks>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDeleteConfirmed = useCallback(() => {
    setConfirmOpen(false);
    onDelete(skill.name);
  }, [skill.name, onDelete]);

  return (
    <div className="animate-in fade-in slide-in-from-top-1 duration-200 select-none">
      <div className="group flex items-center gap-2.5 p-1 px-0">
        <div
          onClickCapture={(e) => {
            if (e.shiftKey) {
              e.stopPropagation();
              e.preventDefault();
              window.getSelection()?.removeAllRanges();
              onToggleSelect(skill.name, true);
            }
          }}
        >
          <Checkbox
            className="cursor-pointer"
            checked={selected}
            onCheckedChange={() => onToggleSelect(skill.name, false)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[10px] font-medium">{skill.name}</span>
          {skill.description !== '' && (
            <span className="truncate text-[10px] text-muted-foreground">{skill.description}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={() => setPreviewOpen(true)}
        >
          <Eye className="size-3" />
        </Button>
      </div>
      <SkillPreviewDialog skill={skill} open={previewOpen} onOpenChange={setPreviewOpen} />
      <DeleteConfirmation
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  );
}
