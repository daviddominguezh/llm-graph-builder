'use client';

import { createOrgAction, uploadOrgAvatarAction } from '@/app/actions/orgs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AvatarUpload } from './AvatarUpload';

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissible?: boolean;
}

interface CreateOrgFieldsProps {
  nameError: string;
  name: string;
  onNameChange: (name: string) => void;
  previewUrl: string | null;
  onFileSelect: (file: File | null) => void;
  onRemove: () => void;
}

function CreateOrgFields(props: CreateOrgFieldsProps) {
  const { nameError, name, onNameChange, previewUrl, onFileSelect, onRemove } = props;
  const t = useTranslations('orgs');

  return (
    <div className="flex items-center gap-4">
      <AvatarUpload
        currentUrl={null}
        previewUrl={previewUrl}
        name={name}
        onFileSelect={onFileSelect}
        onRemove={previewUrl !== null ? onRemove : undefined}
      />
      <div className="flex flex-1 flex-col gap-1">
        <Label htmlFor="org-name">{t('name')}</Label>
        <Input
          id="org-name"
          name="name"
          placeholder={t('namePlaceholder')}
          required
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
    </div>
  );
}

async function submitOrg(name: string, file: File | null): Promise<string> {
  const { result: org, error } = await createOrgAction(name);

  if (error !== null || org === null) {
    throw new Error(error ?? 'Failed to create organization');
  }

  if (file !== null) {
    const formData = new FormData();
    formData.append('file', file);
    await uploadOrgAvatarAction(org.id, formData);
  }

  return org.slug;
}

function useCreateOrgSubmit(onOpenChange: (open: boolean) => void) {
  const t = useTranslations('orgs');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const fileRef = useRef<File | null>(null);

  function setFile(file: File | null) {
    fileRef.current = file;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();

    if (name === '') {
      setNameError(t('nameRequired'));
      return;
    }

    setLoading(true);
    setNameError('');

    try {
      const slug = await submitOrg(name, fileRef.current);
      onOpenChange(false);
      router.push(`/orgs/${slug}`);
    } catch {
      setLoading(false);
      toast.error(t('createError'));
    }
  }

  return { loading, nameError, handleSubmit, setFile };
}

function CreateOrgForm({ onOpenChange }: CreateOrgDialogProps) {
  const t = useTranslations('orgs');
  const { loading, nameError, handleSubmit, setFile } = useCreateOrgSubmit(onOpenChange);
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleFileSelect(file: File | null) {
    setFile(file);
    setPreviewUrl(file !== null ? URL.createObjectURL(file) : null);
  }

  function handleRemove() {
    setFile(null);
    setPreviewUrl(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateOrgFields
        nameError={nameError}
        name={name}
        onNameChange={setName}
        previewUrl={previewUrl}
        onFileSelect={handleFileSelect}
        onRemove={handleRemove}
      />
      <DialogFooter>
        <Button type="submit" disabled={loading || name.trim() === ''}>
          {t('create')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateOrgDialog({ open, onOpenChange, dismissible = true }: CreateOrgDialogProps) {
  const t = useTranslations('orgs');
  const handleOpenChange = dismissible ? onOpenChange : () => {};

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={dismissible}>
        <DialogHeader>
          <DialogTitle>{t('create')}</DialogTitle>
        </DialogHeader>
        <CreateOrgForm open={open} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
