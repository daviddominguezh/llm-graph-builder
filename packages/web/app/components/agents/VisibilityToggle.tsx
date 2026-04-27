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
import { Globe, Lock } from 'lucide-react';
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

function handleCardSelect(
  value: boolean,
  currentVersion: number,
  t: (key: string) => string,
  setPendingValue: (v: boolean) => void,
  setDialogOpen: (v: boolean) => void
) {
  if (currentVersion === 0 && value) {
    toast.error(t('mustPublishFirst'));
    return;
  }
  setPendingValue(value);
  setDialogOpen(true);
}

function VisibilityOption({
  selected,
  onClick,
  icon,
  label,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  const border = selected ? 'border-primary ring-1 ring-primary' : 'border-transparent';
  const background = selected ? 'bg-input/30' : 'bg-input/30';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-[border-color,box-shadow] duration-150 hover:bg-input/40 ${border} ${background}`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{description}</p>
    </button>
  );
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

  const selectVisibility = (value: boolean) => {
    handleCardSelect(value, currentVersion, t, state.setPendingValue, state.setDialogOpen);
  };

  const onConfirm = () => {
    void handleConfirm(agentId, state.pendingValue, state.setIsPublic, state.setDialogOpen, router.refresh);
  };

  return (
    <>
      <div className="flex gap-2">
        <VisibilityOption
          selected={!state.isPublic}
          onClick={() => selectVisibility(false)}
          icon={<Lock className="size-3.5 text-muted-foreground" />}
          label={t('visibilityPrivate')}
          description={t('privateDescription')}
        />
        <VisibilityOption
          selected={state.isPublic}
          onClick={() => selectVisibility(true)}
          icon={<Globe className="size-3.5 text-green-600 dark:text-green-400" />}
          label={t('visibilityPublic')}
          description={t('publicDescription')}
        />
      </div>
      <VisibilityDialog
        open={state.dialogOpen}
        pendingValue={state.pendingValue}
        onConfirm={onConfirm}
        onCancel={() => state.setDialogOpen(false)}
      />
    </>
  );
}
