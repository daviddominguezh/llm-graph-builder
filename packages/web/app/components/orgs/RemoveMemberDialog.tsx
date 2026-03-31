'use client';

import { removeMemberAction } from '@/app/actions/orgMembers';
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
import { useState } from 'react';
import { toast } from 'sonner';

interface RemoveMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  userId: string;
  memberName: string;
  onRemoved: () => void;
}

function useRemoveMember(props: RemoveMemberDialogProps) {
  const t = useTranslations('team');
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    const { error } = await removeMemberAction(props.orgId, props.userId);
    setLoading(false);

    if (error !== null) {
      toast.error(t('removeError'));
      return;
    }

    toast.success(t('removeSuccess', { name: props.memberName }));
    props.onOpenChange(false);
    props.onRemoved();
  }

  return { loading, handleRemove };
}

export function RemoveMemberDialog(props: RemoveMemberDialogProps) {
  const t = useTranslations('team');
  const { loading, handleRemove } = useRemoveMember(props);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('removeTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('removeDescription', { name: props.memberName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('removeCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleRemove} disabled={loading}>
            {loading ? t('removing') : t('removeConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
