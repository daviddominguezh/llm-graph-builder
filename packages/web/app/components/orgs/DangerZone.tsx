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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface DangerZoneProps {
  org: OrgRow;
}

function useDeleteOrg(org: OrgRow) {
  const t = useTranslations('orgs');
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const { error } = await deleteOrgAction(org.id);

    if (error !== null) {
      setLoading(false);
      toast.error(t('deleteError'));
      return;
    }

    window.location.href = '/';
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
    <Card className="border-transparent dark:border-red-400 bg-red-50 dark:bg-transparent border-1 flex flex-col gap-0 mx-4 ring-0 mb-16">
      <CardHeader>
        <CardTitle className="text-destructive">{t('dangerZone')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='flex items-center justify-between mt-1'>
          <CardDescription>{t('dangerDescription')}</CardDescription>
          <Button variant="destructive" size="sm" className="border-[0.5px] rounded-md" onClick={() => setConfirmOpen(true)}>
            {t('delete')}
          </Button>
        </div>
      </CardContent>
      <DeleteConfirmDialog org={org} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </Card>
  );
}
