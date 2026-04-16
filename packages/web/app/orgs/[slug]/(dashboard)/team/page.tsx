import { TeamSection } from '@/app/components/orgs/TeamSection';
import { getOrgInvitations, getOrgMembers } from '@/app/lib/orgMembers';
import { getOrgBySlug, getOrgRole } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';
import { redirect } from 'next/navigation';

interface TeamPageProps {
  params: Promise<{ slug: string }>;
}

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export default async function TeamPage({ params }: TeamPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { result: org } = await getOrgBySlug(slug);

  if (!org) {
    redirect('/');
  }

  const [role, { result: members }, { result: invitations }, userId] = await Promise.all([
    getOrgRole(org.id),
    getOrgMembers(org.id),
    getOrgInvitations(org.id),
    getCurrentUserId(),
  ]);

  if (userId === null) {
    redirect('/login');
  }

  return (
    <div className="h-[calc(100%-var(--spacing)*1.5)] overflow-y-auto p-6 border mr-1.5 rounded-xl">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <TeamSection
          orgId={org.id}
          initialMembers={members}
          initialInvitations={invitations}
          currentUserRole={role}
          currentUserId={userId}
        />
      </div>
    </div>
  );
}
