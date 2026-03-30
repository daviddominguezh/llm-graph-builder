'use client';

import { getSkills } from '@/app/lib/skillFetcher';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

export interface SkillEntry {
  name: string;
  description: string;
  content: string;
  repoUrl: string;
}

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkillsAdded: (skills: SkillEntry[]) => void;
}

const GITHUB_URL_RE = /^https?:\/\/github\.com\/[^/]+\/[^/]+/;
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function isValidGitHubUrl(url: string): boolean {
  return GITHUB_URL_RE.test(url);
}

function extractFrontmatterField(content: string, field: string): string {
  const fmMatch = content.match(FRONTMATTER_RE);
  if (!fmMatch || fmMatch[1] === undefined) return '';
  const line = fmMatch[1].split('\n').find((l) => l.startsWith(`${field}:`));
  if (!line) return '';
  return line.slice(field.length + 1).trim().replace(/^['"]|['"]$/g, '');
}

function DialogBody({ onSkillsAdded, onOpenChange }: Omit<AddSkillDialogProps, 'open'>) {
  const t = useTranslations('agentEditor');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!isValidGitHubUrl(url)) {
      setError(t('addSkillInvalidUrl'));
      return;
    }
    setLoading(true);
    try {
      const skills = await getSkills(url);
      if (!skills) {
        setError(t('addSkillError'));
        return;
      }
      const entries: SkillEntry[] = Object.entries(skills).map(([name, content]) => ({
        name,
        description: extractFrontmatterField(content, 'description'),
        content,
        repoUrl: url,
      }));
      onSkillsAdded(entries);
      onOpenChange(false);
    } catch {
      setError(t('addSkillError'));
    } finally {
      setLoading(false);
    }
  }, [url, t, onSkillsAdded, onOpenChange]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('addSkillTitle')}</DialogTitle>
        <DialogDescription>{t('skillsDescription')}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="skill-repo-url" className="text-xs">
          URL
        </Label>
        <Input
          id="skill-repo-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('addSkillPlaceholder')}
          disabled={loading}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" disabled={loading} />}>
          {t('addSkillCancel')}
        </DialogClose>
        <Button size="sm" onClick={handleSubmit} disabled={loading || url.trim() === ''}>
          {loading && <Loader2 className="mr-1 size-3 animate-spin" />}
          {loading ? t('addSkillLoading') : t('addSkillConfirm')}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AddSkillDialog({ open, onOpenChange, onSkillsAdded }: AddSkillDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogBody onOpenChange={onOpenChange} onSkillsAdded={onSkillsAdded} />
      </DialogContent>
    </Dialog>
  );
}
