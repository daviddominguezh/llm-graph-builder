import { ConnectionsSection } from '@/app/account/ConnectionsSection';
import { ProfileSection } from '@/app/account/ProfileSection';
import { SecuritySection } from '@/app/account/SecuritySection';
import { createClient } from '@/app/lib/supabase/server';
import { Separator } from '@/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

export default async function AccountPage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user === null) {
    redirect('/login');
  }

  const t = await getTranslations('account');
  const email = user.email ?? '';
  const phone = user.phone ?? null;
  const fullName = (user.user_metadata as Record<string, string> | undefined)?.full_name ?? null;

  return (
    <div className="h-[calc(100%-var(--spacing)*2)] overflow-y-auto p-6 border rounded-xl mr-2 overflow-hidden bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div>
          <h1 className="text-sm font-semibold">{t('title')}</h1>
        </div>
        <Separator />
        <ProfileSection email={email} fullName={fullName} />
        <Separator />
        <SecuritySection phone={phone} />
        <Separator />
        <ConnectionsSection userEmail={email} />
      </div>
    </div>
  );
}
