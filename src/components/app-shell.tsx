'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspace } from '@/components/workspace';
import {
  IconBuilding,
  IconClock,
  IconGauge,
  IconLogout,
  IconMap,
  IconSliders,
  IconTarget,
  IconUpload,
  IconWind,
} from '@/components/icons';

/**
 * App shell.
 *
 * A persistent sidebar rather than a centred card: the primary job here is
 * scanning a ranked list thousands of rows long, and the old boxed layout threw
 * away most of a laptop screen to do it. On phones the sidebar becomes a bottom
 * tab bar, since this gets opened in a truck between jobs and thumbs land at the
 * bottom of the screen.
 */
const TABS = [
  { href: '/dashboard', label: 'Dashboard', Icon: IconGauge },
  { href: '/candidates', label: 'Candidates', Icon: IconTarget },
  { href: '/map', label: 'Map', Icon: IconMap },
  { href: '/follow-ups', label: 'Follow-ups', Icon: IconClock },
  { href: '/portfolios', label: 'Portfolios', Icon: IconBuilding },
  { href: '/import', label: 'Data', Icon: IconUpload },
  { href: '/settings', label: 'Settings', Icon: IconSliders },
];

export function AppShell({ orgName, children }: { orgName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { userEmail, dueCount, signOut } = useWorkspace();

  return (
    <div className="flex-1 flex max-md:flex-col">
      {/* ---------- desktop sidebar ---------- */}
      <aside className="max-md:hidden w-[224px] shrink-0 border-r border-line bg-panel flex flex-col sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-4 h-16 border-b border-line">
          <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center shrink-0">
            <IconWind />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[14.5px] leading-tight tracking-tight">
              PanePilot
            </div>
            <div className="text-[11px] text-ink3 truncate" title={orgName}>
              {orgName}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-2.5 flex flex-col gap-0.5 overflow-y-auto">
          {TABS.map(({ href, label, Icon }) => {
            const on = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`relative flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] transition-colors ${
                  on
                    ? 'bg-accent-soft text-accent-dark font-semibold'
                    : 'text-ink2 hover:bg-soft hover:text-ink'
                }`}
              >
                <Icon className={on ? 'text-accent' : 'text-ink3'} />
                {label}
                {href === '/follow-ups' && dueCount > 0 && (
                  <span className="num ml-auto bg-bad text-white rounded-full text-[10px] font-semibold px-1.5 leading-[17px] min-w-[19px] text-center">
                    {dueCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-2.5">
          <div className="px-1 pb-2 text-[11px] text-ink3 truncate" title={userEmail}>
            {userEmail}
          </div>
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] text-ink2 hover:bg-soft hover:text-ink cursor-pointer transition-colors"
          >
            <IconLogout className="text-ink3" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------- mobile top bar ---------- */}
      <header className="md:hidden flex items-center gap-2.5 px-4 h-14 border-b border-line bg-panel sticky top-0 z-20">
        <div className="w-7 h-7 rounded-lg bg-accent text-white grid place-items-center shrink-0">
          <IconWind />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[13.5px] leading-tight">PanePilot</div>
          <div className="text-[10.5px] text-ink3 truncate">{orgName}</div>
        </div>
        <button
          onClick={() => void signOut()}
          title="Sign out"
          className="p-2 rounded-lg text-ink3 hover:bg-soft cursor-pointer"
        >
          <IconLogout />
        </button>
      </header>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-md:pb-24">{children}</main>

      {/* ---------- mobile bottom tabs ---------- */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-panel border-t border-line flex overflow-x-auto">
        {TABS.map(({ href, label, Icon }) => {
          const on = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? 'page' : undefined}
              className={`relative flex-1 min-w-[62px] flex flex-col items-center gap-1 py-2 text-[10px] ${
                on ? 'text-accent font-semibold' : 'text-ink3'
              }`}
            >
              <Icon />
              {label}
              {href === '/follow-ups' && dueCount > 0 && (
                <span className="num absolute top-1 right-[22%] bg-bad text-white rounded-full text-[9px] font-semibold px-1 leading-[14px] min-w-[14px] text-center">
                  {dueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
