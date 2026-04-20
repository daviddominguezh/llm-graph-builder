'use client';

import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import 'quill/dist/quill.snow.css';

import { SystemPromptToolbar } from './SystemPromptToolbar';
import './systemPromptEditor.css';
import { useSystemPromptQuill } from './useSystemPromptQuill';

interface SystemPromptFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function SystemPromptField({ value, onChange }: SystemPromptFieldProps) {
  const t = useTranslations('agentEditor');
  const { quill, quillRef } = useSystemPromptQuill({
    value,
    onChange,
    placeholder: t('systemPromptPlaceholder'),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="mb-[calc(var(--spacing)+1px)] flex items-center justify-between">
        <Label htmlFor="system-prompt" className="text-xs font-medium">
          {t('systemPrompt')}
        </Label>
        <SystemPromptToolbar quill={quill} />
      </div>
      <div className="system-prompt-editor flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <div ref={quillRef} id="system-prompt" className="flex min-h-0 flex-1 flex-col" />
      </div>
    </div>
  );
}
