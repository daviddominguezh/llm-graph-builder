'use client';

import { updateEnvVariableAction } from '@/app/actions/orgEnvVariables';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

interface EditEnvVariableDialogProps {
  variable: OrgEnvVariableRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface EditFormFieldsProps {
  defaultName: string;
  isSecret: boolean;
  onIsSecretChange: (checked: boolean) => void;
}

function EditFormFields({ defaultName, isSecret, onIsSecretChange }: EditFormFieldsProps) {
  const t = useTranslations('envVariables');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-var-name">{t('name')}</Label>
        <Input id="edit-var-name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="edit-var-value">{t('value')}</Label>
        <Input id="edit-var-value" name="value" defaultValue="" placeholder={t('enterNewValue')} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-var-secret"
          checked={isSecret}
          onCheckedChange={(checked) => onIsSecretChange(checked === true)}
        />
        <Label htmlFor="edit-var-secret">{t('secret')}</Label>
      </div>
    </>
  );
}

function EditForm({ variable, onOpenChange, onSaved }: Omit<EditEnvVariableDialogProps, 'open'>) {
  const t = useTranslations('envVariables');
  const [loading, setLoading] = useState(false);
  const [isSecret, setIsSecret] = useState(variable.is_secret);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const rawValue = (formData.get('value') as string).trim();
    const value = rawValue.length > 0 ? rawValue : undefined;

    setLoading(true);
    const { error } = await updateEnvVariableAction(variable.id, { name, value, isSecret });
    setLoading(false);

    if (error !== null) {
      toast.error(t('updateError'));
      return;
    }

    onOpenChange(false);
    onSaved();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <EditFormFields defaultName={variable.name} isSecret={isSecret} onIsSecretChange={setIsSecret} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditEnvVariableDialog({ variable, open, onOpenChange, onSaved }: EditEnvVariableDialogProps) {
  const t = useTranslations('envVariables');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editTitle')}</DialogTitle>
        </DialogHeader>
        <EditForm variable={variable} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}
