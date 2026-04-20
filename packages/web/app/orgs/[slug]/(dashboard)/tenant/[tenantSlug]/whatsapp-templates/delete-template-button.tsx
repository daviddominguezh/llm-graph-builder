'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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

import { deleteTemplateAction } from './actions';

interface DeleteTemplateButtonProps {
  tenantId: string;
  orgSlug: string;
  tenantSlug: string;
  templateId: string;
  templateName: string;
}

export function DeleteTemplateButton({
  tenantId,
  orgSlug,
  tenantSlug,
  templateId,
  templateName,
}: DeleteTemplateButtonProps) {
  const t = useTranslations('whatsappTemplates.delete');
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const { error } = await deleteTemplateAction(tenantId, orgSlug, tenantSlug, templateId);
      if (error !== null) {
        toast.error(error);
        return;
      }
      toast.success(t('success'));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            aria-label={t('confirm')}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('confirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('confirmDescription', { name: templateName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
