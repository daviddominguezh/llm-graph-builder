'use client';

import { Separator } from '@/components/ui/separator';
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
    <div className="flex min-h-0 flex-1 flex-col gap-0  rounded-md border">
      <div className="flex items-center justify-between">
        <SystemPromptToolbar quill={quill} />
      </div>
      <Separator />
      <div className="system-prompt-editor flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref={quillRef} id="system-prompt" className="flex min-h-0 flex-1 flex-col" />
      </div>
    </div>
  );
}
