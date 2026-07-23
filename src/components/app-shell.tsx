'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/components/workspace';
import { IconLogout, IconWind } from '@/components/icons';

const TABS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/candidates', label: 'Candidates' },
  { href: '/map', label: 'Map & routes' },
  { href: '/follow-ups', label: 'Follow-ups' },
  { href: '/portfolios', label: 'Portfolios' },
  { href: '/import', label: 'Data' },
  { href: '/settings', label: 'Settings' },
];

export function AppShell({ orgName, children }: { orgName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { userEmail, dueCount, signOut } = useWorkspace();

  return (
    <div className="flex-1 py-6 px-3.5">
      <div className="max-w-[1020px] mx-auto">
        <div className="bg-panel border border-line rounded-[14px] overflow-hidden shadow-[0_2px_16px_rgba(17,17,19,0.05)]">
          <header className="flex items-center gap-2.5 px-4 sm:px-5 py-3 border-b border-line flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center shrink-0">
              <IconWind />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-[14.5px] leading-tight">PanePilot</div>
              <div className="text-[11px] text-ink3 truncate">
                {orgName} · {userEmail}
              </div>
            </div>
            <nav className="flex gap-0.5 ml-auto flex-wrap items-center max-sm:w-full max-sm:order-last max-sm:overflow-x-auto max-sm:flex-nowrap max-sm:-mx-1 max-sm:px-1">
              {TABS.map((t) => {
                const on = pathname.startsWith(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`relative px-2.5 py-1.5 rounded-full text-[12.5px] whitespace-nowrap ${
                      on
                        ? 'bg-accent-soft text-accent-dark font-semibold'
                        : 'text-ink2 hover:bg-soft'
                    }`}
                  >
                    {t.label}
                    {t.href === '/follow-ups' && dueCount > 0 && (
                      <span className="absolute top-0 right-0 bg-bad text-white rounded-full text-[9.5px] font-bold px-1 min-w-[14px] leading-[14px] text-center">
                        {dueCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              <button
                onClick={() => void signOut()}
                title="Sign out"
                className="px-2.5 py-1.5 rounded-full text-ink2 hover:bg-soft cursor-pointer"
              >
                <IconLogout />
              </button>
            </nav>
          </header>
          <main className="p-4 sm:p-5 min-h-[460px]">{children}</main>
        </div>
        <p className="text-center text-ink3 text-[11.5px] mt-3">
          Live shared workspace — statuses, notes, and sequence progress sync for the whole team.
        </p>
      </div>
    </div>
  );
}
