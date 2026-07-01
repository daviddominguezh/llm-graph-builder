'use client';

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

interface TenantSwitchResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function TenantSwitchResetDialog({
  open,
  onOpenChange,
  onConfirm,
}: TenantSwitchResetDialogProps): React.JSX.Element {
  const t = useTranslations('simulation');
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('tenantSwitchReset.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('tenantSwitchReset.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('tenantSwitchReset.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('tenantSwitchReset.confirm')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
