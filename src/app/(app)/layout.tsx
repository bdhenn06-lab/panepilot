import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { WorkspaceProvider } from '@/components/workspace';
import { ToastProvider } from '@/components/toast';
import { AppShell } from '@/components/app-shell';
import { resolveActiveOrgId } from '@/lib/active-org';
import type { OrgRow } from '@/lib/db/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // All memberships (oldest first) — the user may belong to several workspaces.
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role, orgs (id, name, plan, created_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (!memberships?.length) redirect('/onboarding');

  const orgs = memberships.map((m) => ({
    id: m.org_id,
    role: m.role as 'owner' | 'admin' | 'member',
    org: (Array.isArray(m.orgs) ? m.orgs[0] : m.orgs) as OrgRow,
  }));

  const activeId = (await resolveActiveOrgId(orgs.map((o) => o.id))) ?? orgs[0].id;
  const active = orgs.find((o) => o.id === activeId) ?? orgs[0];

  return (
    <ToastProvider>
      <WorkspaceProvider
        key={active.id}
        orgId={active.id}
        org={active.org}
        role={active.role}
        userEmail={user.email ?? ''}
        userId={user.id}
      >
        <AppShell
          orgs={orgs.map((o) => ({ id: o.id, name: o.org.name }))}
          activeOrgId={active.id}
        >
          {children}
        </AppShell>
      </WorkspaceProvider>
    </ToastProvider>
  );
}
