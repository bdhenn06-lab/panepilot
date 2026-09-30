import { cookies } from 'next/headers';

/**
 * Which org a multi-workspace user is currently looking at.
 *
 * A user can belong to several orgs (they created more than one, or accepted
 * invites to other teams). The app renders exactly one at a time; this cookie
 * remembers which. It is read by the (app) layout on every request and written
 * only by the `switchOrg` server action.
 */
export const ACTIVE_ORG_COOKIE = 'pp_active_org';

/**
 * Resolve the active org id for this request: the cookie's choice when the user
 * still belongs to it, otherwise the first (oldest) membership. Returns null
 * when the user has no memberships.
 */
export async function resolveActiveOrgId(memberOrgIds: string[]): Promise<string | null> {
  if (memberOrgIds.length === 0) return null;
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  if (preferred && memberOrgIds.includes(preferred)) return preferred;
  return memberOrgIds[0];
}
