'use client';

import { publishAgent } from '@/app/lib/agents';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface PublishButtonProps {
  agentId: string;
  canPublish: boolean;
  onPublished: (newVersion: number) => void;
}

function PublishSpinner() {
  return (
    <Button variant="ghost" size="sm" disabled className="h-10 gap-1.5 px-3">
      <Loader2 className="size-4 animate-spin" />
    </Button>
  );
}

export function PublishButton({ agentId, canPublish, onPublished }: PublishButtonProps) {
  const t = useTranslations('editor');
  const [publishing, setPublishing] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    const supabase = createClient();
    const { version: newVersion, error } = await publishAgent(supabase, agentId);

    if (error !== null || newVersion === null) {
      toast.error(t('publishFailed'));
      setPublishing(false);
      return;
    }

    onPublished(newVersion);
    setPublishing(false);
  }

  if (publishing) {
    return <PublishSpinner />;
  }

  return (
    <Button
      variant={canPublish ? 'default' : 'ghost'}
      size="sm"
      onClick={handlePublish}
      disabled={!canPublish}
      className="h-10 gap-1.5 px-3"
    >
      <Upload className="size-4" />
      {t('publish')}
    </Button>
  );
}
