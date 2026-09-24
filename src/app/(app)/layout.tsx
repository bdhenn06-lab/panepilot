import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { WorkspaceProvider } from '@/components/workspace';
import { DemoWorkspaceProvider } from '@/components/demo-workspace';
import { ToastProvider } from '@/components/toast';
import { AppShell } from '@/components/app-shell';
import { DEMO_COOKIE, DEMO_ORG } from '@/lib/sample-territory';
import type { OrgRow } from '@/lib/db/types';

function DemoShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DemoWorkspaceProvider>
        <AppShell orgName={DEMO_ORG.name}>{children}</AppShell>
      </DemoWorkspaceProvider>
    </ToastProvider>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get(DEMO_COOKIE)?.value === '1';

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
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
  }

  if (isDemo) return <DemoShell>{children}</DemoShell>;
  redirect(hasSupabaseEnv() ? '/login' : '/');
}
