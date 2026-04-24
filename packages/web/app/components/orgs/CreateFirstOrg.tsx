'use client';

import logo from '@/app/assets/brand-icon.png';
import logoBlack from '@/app/openflowLogoBlack.png';
import logoWhite from '@/app/openflowLogoWhite.png';
import { useSlugAvailability } from '@/app/hooks/useSlugAvailability';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { CreateOrgFields, submitOrg } from './CreateOrgDialog';

function WelcomeLogo() {
  return (
    <div className="welcome-stagger-1 flex items-center gap-2 mr-2">
      <Image className="mb-0.5" src={logo} alt="OpenFlow" height={28} priority />
      <Image className="dark:hidden" src={logoBlack} alt="OpenFlow" height={20} priority />
      <Image className="hidden dark:block" src={logoWhite} alt="OpenFlow" height={20} priority />
    </div>
  );
}

function WelcomeHeading() {
  const t = useTranslations('orgs.welcome');

  return (
    <div className="welcome-stagger-2 flex flex-col gap-1.5 text-center">
      <h1 className="text-xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground text-sm">{t('description')}</p>
    </div>
  );
}

function useWelcomeSubmit() {
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
      router.push(`/orgs/${slug}`);
    } catch {
      setLoading(false);
      toast.error(t('createError'));
    }
  }

  return { loading, nameError, handleSubmit, setFile };
}

function WelcomeForm() {
  const tWelcome = useTranslations('orgs.welcome');
  const { loading, nameError, handleSubmit, setFile } = useWelcomeSubmit();
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { checking, available } = useSlugAvailability(name, 'organizations');
  const disabled = loading || checking || available !== true || name.trim() === '';

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
        nameTaken={available === false}
        name={name}
        onNameChange={setName}
        previewUrl={previewUrl}
        onFileSelect={handleFileSelect}
        onRemove={handleRemove}
      />
      <Button type="submit" disabled={disabled} className="w-full">
        {loading || checking ? <Loader2 className="size-4 animate-spin" /> : tWelcome('cta')}
      </Button>
    </form>
  );
}

export function CreateFirstOrg() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 mb-14">
        <WelcomeLogo />
        <WelcomeHeading />
        <Card className="mt-3 welcome-stagger-3 w-full max-w-sm shadow-xl w-[400px] bg-background border-[0.5px]! ring-0 outline-none">
          <CardContent>
            <WelcomeForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
