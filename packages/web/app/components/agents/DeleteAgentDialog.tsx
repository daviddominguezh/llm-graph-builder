'use client';

import { deleteAgentAction } from '@/app/actions/agents';
import type { AgentMetadata } from '@/app/lib/agents';
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
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface DeleteAgentDialogProps {
  agent: AgentMetadata | null;
  onOpenChange: () => void;
}

export function DeleteAgentDialog({ agent, onOpenChange }: DeleteAgentDialogProps) {
  const t = useTranslations('agents');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isOpen = agent !== null;

  async function handleDelete() {
    if (agent === null) return;
    setLoading(true);

    const { error } = await deleteAgentAction(agent.id);

    setLoading(false);

    if (error !== null) {
      toast.error(error);
      return;
    }

    onOpenChange();
    router.refresh();
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange(isOpen, onOpenChange)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('deleteDescription', { name: agent?.name ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onOpenChange}>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={loading}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function handleOpenChange(isOpen: boolean, onOpenChange: () => void) {
  return (open: boolean) => {
    if (isOpen && !open) {
      onOpenChange();
    }
  };
}
