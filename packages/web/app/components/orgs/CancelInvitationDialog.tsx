'use client';

import { cancelInvitationAction } from '@/app/actions/orgMembers';
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
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface CancelInvitationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  invitationId: string;
  email: string;
  onCancelled: () => void;
}

function useCancelInvitation(props: CancelInvitationDialogProps) {
  const t = useTranslations('team');
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    const { error } = await cancelInvitationAction(props.orgId, props.invitationId);
    setLoading(false);

    if (error !== null) {
      toast.error(t('cancelInviteError'));
      return;
    }

    toast.success(t('cancelInviteSuccess', { email: props.email }));
    props.onOpenChange(false);
    props.onCancelled();
  }

  return { loading, handleCancel };
}

export function CancelInvitationDialog(props: CancelInvitationDialogProps) {
  const t = useTranslations('team');
  const { loading, handleCancel } = useCancelInvitation(props);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('cancelInviteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('cancelInviteDescription', { email: props.email })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancelInviteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleCancel} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : t('cancelInviteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
