'use client';

import { deleteAgentAction } from '@/app/actions/agents';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface AgentDangerZoneProps {
  agentId: string;
  agentName: string;
  orgSlug: string;
}

export function AgentDangerZone({ agentId, agentName, orgSlug }: AgentDangerZoneProps) {
  const t = useTranslations('toolbar');
  const ta = useTranslations('agents');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const { error } = await deleteAgentAction(agentId);
    setLoading(false);
    if (error !== null) {
      toast.error(error);
      return;
    }
    router.push(`/orgs/${orgSlug}`);
  }

  return (
    <div className="mt-6 border-t pt-5">
      <Label className="text-destructive">{t('dangerZone')}</Label>
      <p className="mt-1 text-xs text-muted-foreground">{t('deleteAgentDescription')}</p>
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" size="sm" className="mt-2">
              {t('deleteAgent')}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ta('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{ta('deleteDescription', { name: agentName })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ta('deleteCancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={loading}>
              {ta('deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
