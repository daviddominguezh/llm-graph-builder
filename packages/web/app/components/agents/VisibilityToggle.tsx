'use client';

import { updateVisibilityAction } from '@/app/actions/agentSettings';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

interface VisibilityToggleProps {
  agentId: string;
  currentVersion: number;
  initialIsPublic: boolean;
}

function useVisibilityState(initialIsPublic: boolean) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [pendingValue, setPendingValue] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  return { isPublic, setIsPublic, pendingValue, setPendingValue, dialogOpen, setDialogOpen };
}

function handleCheckboxChange(
  checked: boolean,
  currentVersion: number,
  t: (key: string) => string,
  setPendingValue: (v: boolean) => void,
  setDialogOpen: (v: boolean) => void
) {
  if (currentVersion === 0 && checked) {
    toast.error(t('mustPublishFirst'));
    return;
  }
  setPendingValue(checked);
  setDialogOpen(true);
}

async function handleConfirm(
  agentId: string,
  pendingValue: boolean,
  setIsPublic: (v: boolean) => void,
  setDialogOpen: (v: boolean) => void,
  refresh: () => void
) {
  const { error } = await updateVisibilityAction(agentId, pendingValue);

  if (error !== null) {
    toast.error(error);
    setDialogOpen(false);
    return;
  }

  setIsPublic(pendingValue);
  setDialogOpen(false);
  refresh();
}

function VisibilityDialog({
  open,
  pendingValue,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  pendingValue: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('settings');

  const title = pendingValue ? t('makePublicTitle') : t('makePrivateTitle');
  const description = pendingValue ? t('makePublicDescription') : t('makePrivateDescription');

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function VisibilityToggle({ agentId, currentVersion, initialIsPublic }: VisibilityToggleProps) {
  const t = useTranslations('settings');
  const router = useRouter();
  const state = useVisibilityState(initialIsPublic);

  const onCheckboxChange = (checked: boolean) => {
    handleCheckboxChange(checked, currentVersion, t, state.setPendingValue, state.setDialogOpen);
  };

  const onConfirm = () => {
    void handleConfirm(agentId, state.pendingValue, state.setIsPublic, state.setDialogOpen, router.refresh);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Checkbox id="visibility-toggle" checked={state.isPublic} onCheckedChange={onCheckboxChange} />
        <Label htmlFor="visibility-toggle">
          {state.isPublic ? t('visibilityPublic') : t('visibilityPrivate')}
        </Label>
      </div>
      <p className="text-muted-foreground text-xs mt-1">{t('publicExplanation')}</p>
      <VisibilityDialog
        open={state.dialogOpen}
        pendingValue={state.pendingValue}
        onConfirm={onConfirm}
        onCancel={() => state.setDialogOpen(false)}
      />
    </>
  );
}
