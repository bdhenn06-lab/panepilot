'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ACTIVE_ORG_COOKIE } from '@/lib/active-org';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Set the active workspace and navigate to it. Verifies the caller actually
 * belongs to the requested org before trusting it (server actions are reachable
 * by direct POST, so the membership check is the real guard). Used by the org
 * switcher, and by onboarding / invite acceptance so a freshly created or joined
 * workspace is the one you land in.
 */
export async function switchOrg(orgId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (membership) {
    (await cookies()).set(ACTIVE_ORG_COOKIE, orgId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: ONE_YEAR,
    });
  }

  redirect('/dashboard');
}
