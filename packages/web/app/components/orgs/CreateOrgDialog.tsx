'use client';

import { createOrgAction, uploadOrgAvatarAction } from '@/app/actions/orgs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useState } from 'react';
import { toast } from 'sonner';

interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissible?: boolean;
}

interface AvatarPreviewState {
  file: File | null;
  previewUrl: string | null;
}

function useAvatarPreview() {
  const [avatar, setAvatar] = useState<AvatarPreviewState>({ file: null, previewUrl: null });

  const onFileSelect = useCallback(
    (file: File | null) => {
      if (avatar.previewUrl !== null) {
        URL.revokeObjectURL(avatar.previewUrl);
      }

      const previewUrl = file !== null ? URL.createObjectURL(file) : null;
      setAvatar({ file, previewUrl });
    },
    [avatar.previewUrl]
  );

  const reset = useCallback(() => {
    if (avatar.previewUrl !== null) {
      URL.revokeObjectURL(avatar.previewUrl);
    }
    setAvatar({ file: null, previewUrl: null });
  }, [avatar.previewUrl]);

  return { avatarFile: avatar.file, previewUrl: avatar.previewUrl, onFileSelect, reset };
}

interface CreateOrgFieldsProps {
  nameError: string;
}

function CreateOrgFields({ nameError }: CreateOrgFieldsProps) {
  const t = useTranslations('orgs');

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="org-name">{t('name')}</Label>
        <Input
          id="org-name"
          name="name"
          placeholder={t('namePlaceholder')}
          required
        />
        {nameError !== '' && <p className="text-destructive text-xs">{nameError}</p>}
      </div>
    </>
  );
}

interface UploadAvatarParams {
  file: File;
  orgId: string;
}

async function handleAvatarUpload({ file, orgId }: UploadAvatarParams): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  const { error } = await uploadOrgAvatarAction(orgId, formData);
  return error;
}

interface SubmitOrgResult {
  slug: string;
}

async function submitOrg(name: string, avatarFile: File | null): Promise<SubmitOrgResult> {
  const { result: org, error } = await createOrgAction(name);

  if (error !== null || org === null) {
    throw new Error(error ?? 'Failed to create organization');
  }

  if (avatarFile !== null) {
    const avatarErr = await handleAvatarUpload({ file: avatarFile, orgId: org.id });

    if (avatarErr !== null) {
      toast.error(avatarErr);
    }
  }

  return { slug: org.slug };
}

function useCreateOrgSubmit(onOpenChange: (open: boolean) => void) {
  const t = useTranslations('orgs');
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const { avatarFile, previewUrl, onFileSelect, reset } = useAvatarPreview();

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
      const { slug } = await submitOrg(name, avatarFile);
      reset();
      onOpenChange(false);
      router.push(`/orgs/${slug}`);
    } catch {
      setLoading(false);
      toast.error(t('createError'));
    }
  }

  return { loading, nameError, previewUrl, onFileSelect, handleSubmit };
}

function CreateOrgForm({ onOpenChange }: CreateOrgDialogProps) {
  const t = useTranslations('orgs');
  const { loading, nameError, handleSubmit } = useCreateOrgSubmit(onOpenChange);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <CreateOrgFields nameError={nameError} />
      <DialogFooter>
        <Button type="submit" disabled={loading}>
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
