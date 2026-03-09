import { redirect } from 'next/navigation';

import { getOrgsByUser } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

import { OrgCardGrid } from './components/orgs/OrgCardGrid';

export default async function HomePage(): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { result: orgs } = await getOrgsByUser(supabase);

  return <OrgCardGrid orgs={orgs} />;
}
