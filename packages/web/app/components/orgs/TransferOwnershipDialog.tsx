'use client';

import { updateMemberRoleAction } from '@/app/actions/orgMembers';
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

interface TransferOwnershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  userId: string;
  memberName: string;
  onTransferred: () => void;
}

function useTransferOwnership(props: TransferOwnershipDialogProps) {
  const t = useTranslations('team');
  const [loading, setLoading] = useState(false);

  async function handleTransfer() {
    setLoading(true);
    const { error } = await updateMemberRoleAction(props.orgId, props.userId, 'owner');
    setLoading(false);

    if (error !== null) {
      toast.error(t('transferError'));
      return;
    }

    toast.success(t('transferSuccess', { name: props.memberName }));
    props.onOpenChange(false);
    props.onTransferred();
  }

  return { loading, handleTransfer };
}

export function TransferOwnershipDialog(props: TransferOwnershipDialogProps) {
  const t = useTranslations('team');
  const { loading, handleTransfer } = useTransferOwnership(props);

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('transferTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('transferDescription', { name: props.memberName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('transferCancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleTransfer} disabled={loading}>
            {loading ? t('transferring') : t('transferConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
