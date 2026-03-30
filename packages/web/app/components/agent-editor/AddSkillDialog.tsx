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
import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

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

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function extractFrontmatterField(content: string, field: string): string {
  const fmMatch = content.match(FRONTMATTER_RE);
  if (!fmMatch || fmMatch[1] === undefined) return '';
  const line = fmMatch[1].split('\n').find((l) => l.startsWith(`${field}:`));
  if (!line) return '';
  return line.slice(field.length + 1).trim().replace(/^['"]|['"]$/g, '');
}

const SKILLS_REPOS = [
  'vercel-labs/skills', 'vercel-labs/agent-skills', 'anthropics/skills',
  'remotion-dev/skills', 'microsoft/github-copilot-for-azure', 'vercel-labs/agent-browser',
  'microsoft/azure-skills', 'inferen-sh/skills', 'nextlevelbuilder/ui-ux-pro-max-skill',
  'obra/superpowers', 'coreyhaines31/marketingskills',
  'supabase/agent-skills', 'vercel-labs/next-skills',
  'roin-orca/skills', 'squirrelscan/skills', 'pbakaus/impeccable',
  'sleekdotdesign/agent-skills', 'better-auth/skills', 'xixu-me/skills',
  'google-labs-code/stitch-skills', 'wshobson/agents', 'expo/skills',
  'firecrawl/cli', 'charon-fan/agent-playbook', 'github/awesome-copilot',
  'anthropics/claude-code', 'resciencelab/opc-skills',
  'currents-dev/playwright-best-practices-skill', 'pexoai/pexo-skills',
  'jimliu/baoyu-skills', 'larksuite/cli', 'neondatabase/agent-skills',
  'aaron-he-zhu/seo-geo-claude-skills',
  'hyf0/vue-skills', 'antfu/skills',
  'googleworkspace/cli', 'giuseppe-trisciuoglio/developer-kit',
  'microsoft/playwright-cli', 'avdlee/swiftui-agent-skill',
  'useai-pro/openclaw-skills-security', 'mattpocock/skills',
];

function toGitHubUrl(slug: string): string {
  return `https://github.com/${slug}`;
}

/* ------------------------------------------------------------------ */
/*  Repo picker                                                        */
/* ------------------------------------------------------------------ */

function RepoItem({ slug, selected, onClick }: { slug: string; selected: boolean; onClick: () => void }) {
  const [owner, repo] = slug.split('/');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-0 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
      }`}
    >
      <span className="text-muted-foreground">{owner}/</span>
      <span className="font-medium">{repo}</span>
    </button>
  );
}

function RepoPicker({ search, onSearchChange, selectedSlug, onSelect }: {
  search: string;
  onSearchChange: (v: string) => void;
  selectedSlug: string;
  onSelect: (slug: string) => void;
}) {
  const t = useTranslations('agentEditor');
  const filtered = useMemo(() => {
    if (search === '') return SKILLS_REPOS;
    const lower = search.toLowerCase();
    return SKILLS_REPOS.filter((s) => s.toLowerCase().includes(lower));
  }, [search]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{t('popularRepos')}</Label>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('searchRepos')}
          className="h-7 pl-7 text-xs"
        />
      </div>
      <div className="min-h-48 max-h-48 overflow-y-auto rounded-md border p-1">
        {filtered.map((slug) => (
          <RepoItem key={slug} slug={slug} selected={slug === selectedSlug} onClick={() => onSelect(slug)} />
        ))}
        {filtered.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">{t('noReposFound')}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dialog body                                                        */
/* ------------------------------------------------------------------ */

function DialogBody({ onSkillsAdded, onOpenChange }: Omit<AddSkillDialogProps, 'open'>) {
  const t = useTranslations('agentEditor');
  const [repoSearch, setRepoSearch] = useState('');
  const [selectedSlug, setSelectedSlug] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveUrl = selectedSlug !== '' ? toGitHubUrl(selectedSlug) : customUrl;

  const handleSelectRepo = useCallback((slug: string) => {
    setSelectedSlug((prev) => (prev === slug ? '' : slug));
    setCustomUrl('');
    setError(null);
  }, []);

  const handleCustomUrlChange = useCallback((value: string) => {
    setCustomUrl(value);
    setSelectedSlug('');
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (effectiveUrl === '') {
      setError(t('addSkillInvalidUrl'));
      return;
    }
    setLoading(true);
    try {
      const skills = await getSkills(effectiveUrl);
      if (!skills) {
        setError(t('addSkillError'));
        return;
      }
      const entries: SkillEntry[] = Object.entries(skills).map(([name, content]) => ({
        name,
        description: extractFrontmatterField(content, 'description'),
        content,
        repoUrl: effectiveUrl,
      }));
      onSkillsAdded(entries);
      onOpenChange(false);
    } catch {
      setError(t('addSkillError'));
    } finally {
      setLoading(false);
    }
  }, [effectiveUrl, t, onSkillsAdded, onOpenChange]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('addSkillTitle')}</DialogTitle>
        <DialogDescription>{t('skillsDescription')}</DialogDescription>
      </DialogHeader>
      <RepoPicker
        search={repoSearch}
        onSearchChange={setRepoSearch}
        selectedSlug={selectedSlug}
        onSelect={handleSelectRepo}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="skill-custom-url" className="text-xs">{t('orCustomUrl')}</Label>
        <Input
          id="skill-custom-url"
          value={customUrl}
          onChange={(e) => handleCustomUrlChange(e.target.value)}
          placeholder={t('addSkillPlaceholder')}
          disabled={loading}
          className="text-xs"
        />
      </div>
      {error !== null && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" size="sm" disabled={loading} />}>
          {t('addSkillCancel')}
        </DialogClose>
        <Button size="sm" onClick={handleSubmit} disabled={loading || effectiveUrl === ''}>
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
