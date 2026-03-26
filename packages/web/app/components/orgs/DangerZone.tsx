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
    <Card className="ring-destructive/20 bg-background ring-0">
      <CardHeader>
        <CardTitle className="text-destructive">{t('dangerZone')}</CardTitle>
        <CardDescription>{t('dangerDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          {t('delete')}
        </Button>
      </CardContent>
      <DeleteConfirmDialog org={org} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </Card>
  );
}
