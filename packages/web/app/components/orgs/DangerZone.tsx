'use client';

import { deleteOrgAction } from '@/app/actions/orgs';
import type { OrgRow } from '@/app/lib/orgs';
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
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface DangerZoneProps {
  org: OrgRow;
}

function useDeleteOrg(org: OrgRow) {
  const t = useTranslations('orgs');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const { error } = await deleteOrgAction(org.id);

    setLoading(false);

    if (error !== null) {
      toast.error(t('deleteError'));
      return;
    }

    router.push('/');
    router.refresh();
  }

  return { loading, handleDelete };
}

function DeleteConfirmDialog({
  org,
  open,
  onOpenChange,
}: DangerZoneProps & { open: boolean; onOpenChange: (value: boolean) => void }) {
  const t = useTranslations('orgs');
  const { loading, handleDelete } = useDeleteOrg(org);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription', { name: org.name })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={loading}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DangerZone({ org }: DangerZoneProps) {
  const t = useTranslations('orgs');
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="border-destructive/50 flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-medium">{t('dangerZone')}</h3>
      <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
        {t('delete')}
      </Button>
      <DeleteConfirmDialog org={org} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </div>
  );
}
