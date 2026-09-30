'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchOrg } from '@/lib/org-actions';
import { IconBuilding, IconCheck, IconChevronDown } from '@/components/icons';

export interface OrgOption {
  id: string;
  name: string;
}

/**
 * Workspace picker shown in the shell header. A user can belong to several orgs;
 * the app shows one at a time (remembered in a cookie), so without this there is
 * no way to reach any workspace but the oldest. Also offers "Create workspace".
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
  compact = false,
}: {
  orgs: OrgOption[];
  activeOrgId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function choose(id: string) {
    setOpen(false);
    if (id === activeOrgId) return;
    startTransition(() => switchOrg(id));
  }

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        title={active?.name}
        className={`flex items-center gap-1.5 min-w-0 rounded-md hover:bg-soft px-1.5 -mx-1.5 py-0.5 cursor-pointer disabled:opacity-60 ${
          compact ? 'max-w-[190px]' : 'w-full'
        }`}
      >
        <span className="min-w-0 flex-1 text-left truncate text-[11px] text-ink3">
          {active?.name ?? 'Workspace'}
        </span>
        <IconChevronDown className="shrink-0 text-ink3 w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-40 w-[240px] max-w-[80vw] rounded-lg border border-line bg-panel shadow-lg p-1"
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-ink3">Workspaces</div>
          <div className="max-h-[260px] overflow-y-auto">
            {orgs.map((o) => {
              const on = o.id === activeOrgId;
              return (
                <button
                  key={o.id}
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => choose(o.id)}
                  className={`w-full flex items-center gap-2 px-2 h-9 rounded-md text-[13px] text-left cursor-pointer hover:bg-soft ${
                    on ? 'text-ink font-semibold' : 'text-ink2'
                  }`}
                >
                  <IconBuilding className="shrink-0 text-ink3" />
                  <span className="flex-1 min-w-0 truncate">{o.name}</span>
                  {on && <IconCheck className="shrink-0 text-accent w-4 h-4" />}
                </button>
              );
            })}
          </div>
          <div className="border-t border-line mt-1 pt-1">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push('/onboarding');
              }}
              className="w-full flex items-center gap-2 px-2 h-9 rounded-md text-[13px] text-left text-accent-dark hover:bg-accent-soft cursor-pointer"
            >
              <span className="shrink-0 w-4 text-center text-[15px] leading-none">+</span>
              <span className="flex-1">Create workspace</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
