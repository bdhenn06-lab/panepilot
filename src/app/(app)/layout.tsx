import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WorkspaceProvider } from '@/components/workspace';
import { ToastProvider } from '@/components/toast';
import { AppShell } from '@/components/app-shell';
import type { OrgRow } from '@/lib/db/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role, orgs (id, name, plan, created_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1);

  if (!memberships?.length) redirect('/onboarding');

  const m = memberships[0];
  const org = (Array.isArray(m.orgs) ? m.orgs[0] : m.orgs) as OrgRow;

  return (
    <ToastProvider>
      <WorkspaceProvider
        orgId={m.org_id}
        org={org}
        role={m.role as 'owner' | 'admin' | 'member'}
        userEmail={user.email ?? ''}
        userId={user.id}
      >
        <AppShell orgName={org.name}>{children}</AppShell>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
