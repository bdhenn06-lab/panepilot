'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Card, Ghost } from '@/components/ui';
import { IconTrash, IconUsers } from '@/components/icons';
import { Loading } from '@/components/loading';
import type { OrgInviteRow } from '@/lib/db/types';
import { defaultsForMode, type ScoringSettings, type ServiceMode } from '@/lib/scoring';

type FieldDef = [keyof ScoringSettings, string, string];

const IDENTITY: FieldDef[] = [
  ['companyName', 'Company name', 'On outreach + proposals'],
  ['contactName', 'Your name', 'Used in outreach + proposals'],
  ['contactPhone', 'Phone', ''],
  ['contactEmail', 'Email', ''],
  ['homeBase', 'Route start address', 'Routes begin here'],
];

const TERRITORY: FieldDef[] = [
  ['localCity', 'Local city', 'Owner mailings matching these count as local buyers'],
  ['localState', 'Local state (abbrev.)', ''],
  ['localZipPrefix', 'Local ZIP prefix', 'e.g. 45 matches 45xxx'],
  ['regionState', 'Address state', 'Appended to property addresses'],
];

const ALGORITHM_SHARED: FieldDef[] = [
  ['valueFloor', 'Value floor ($/yr)', 'Contract value that scores 0'],
  ['valueCeil', 'Value ceiling ($/yr)', 'Contract value that scores 100'],
  ['weightValue', 'Weight: value', 'Default 30'],
  ['weightFit', 'Weight: fit', 'Default 20'],
  ['weightBuyer', 'Weight: buyer', 'Default 20'],
  ['weightPortfolio', 'Weight: portfolio', 'Default 15'],
  ['weightDensity', 'Weight: density', 'Default 15'],
];

const ALGORITHM_COMMERCIAL_ONLY: FieldDef[] = [
  ['minFloors', 'Min ideal floors', ''],
  ['maxFloors', 'Max serviceable floors', 'Above this, score decays'],
];

const PRICING_COMMERCIAL: FieldDef[] = [
  ['floorHeight', 'Floor height (ft)', ''],
  ['windowToWallPct', 'Window-to-wall %', ''],
  ['windowSize', 'Avg window sq ft', ''],
  ['panesPerWindow', 'Panes per window', ''],
  ['footprintAspect', 'Footprint aspect', ''],
  ['ratePerSqft', '$ / sq ft glass', ''],
  ['liftFeePerFloor', 'Lift fee / floor', ''],
  ['minJob', 'Minimum job $', ''],
  ['quarterlyDiscountPct', 'Quarterly disc %', ''],
  ['monthlyDiscountPct', 'Monthly disc %', ''],
];

const PRICING_RESIDENTIAL: FieldDef[] = [
  ['resSqftPerWindow', 'Sq ft per window', 'Estimates window count from finished sqft'],
  ['resPricePerWindow', '$ / window', ''],
  ['resUpperStoryPct', 'Upper-story surcharge %', 'Added per story above the first'],
  ['panesPerWindow', 'Panes per window', ''],
  ['minJob', 'Minimum job $', ''],
  ['quarterlyDiscountPct', '4x/year plan disc %', ''],
  ['monthlyDiscountPct', 'Monthly plan disc %', ''],
];

const TEXT_KEYS = new Set<keyof ScoringSettings>([
  'companyName', 'contactName', 'contactPhone', 'contactEmail', 'homeBase',
  'localCity', 'localState', 'localZipPrefix', 'regionState',
]);

function SettingsBlock({
  title,
  fields,
  display,
  onChange,
  onBlur,
}: {
  title: string;
  fields: FieldDef[];
  display: (k: keyof ScoringSettings) => string;
  onChange: (k: keyof ScoringSettings, v: string) => void;
  onBlur: (k: keyof ScoringSettings) => void;
}) {
  return (
    <Card className="mb-3">
      <p className="font-semibold mb-1.5">{title}</p>
      {fields.map(([key, label, hint]) => (
        <div
          key={key}
          className="grid grid-cols-[1fr_130px] gap-2.5 items-center py-1.5 border-b border-dashed border-line last:border-0"
        >
          <label className="text-[12.5px]">
            {label}
            {hint && <small className="block text-ink3 text-[11px]">{hint}</small>}
          </label>
          <input
            type={TEXT_KEYS.has(key) ? 'text' : 'number'}
            step="0.01"
            className="h-8 border border-line2 rounded-md px-2 text-[12.5px] w-full outline-none focus:border-accent"
            value={display(key)}
            onChange={(e) => onChange(key, e.target.value)}
            onBlur={() => onBlur(key)}
          />
        </div>
      ))}
    </Card>
  );
}

function ServiceModeBlock({
  mode,
  onSwitch,
}: {
  mode: ServiceMode;
  onSwitch: (m: ServiceMode) => void;
}) {
  return (
    <Card className="mb-3">
      <p className="font-semibold mb-1.5">Service type</p>
      <p className="text-xs text-ink2 mb-2">
        Changes the pricing model, PaneScore anchors, and outreach copy. Switching resets pricing
        to typical starting numbers for that business — customizations for the other mode aren&apos;t
        kept.
      </p>
      <div className="flex gap-2">
        {(['commercial', 'residential'] as const).map((m) => (
          <button
            key={m}
            onClick={() => onSwitch(m)}
            className={`flex-1 h-10 rounded-lg text-[13px] font-semibold border capitalize cursor-pointer ${
              mode === m
                ? 'bg-accent-soft text-accent-dark border-accent'
                : 'bg-panel text-ink2 border-line2 hover:bg-soft'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </Card>
  );
}

function TeamSection() {
  const ws = useWorkspace();
  const toast = useToast();
  const supabase = createClient();
  const [invites, setInvites] = useState<OrgInviteRow[]>([]);
  const [members, setMembers] = useState<{ user_id: string; role: string }[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = ws.role === 'owner' || ws.role === 'admin';

  useEffect(() => {
    void supabase
      .from('org_members')
      .select('user_id, role')
      .eq('org_id', ws.orgId)
      .then(({ data }) => setMembers(data ?? []));
    if (isAdmin) {
      void supabase
        .from('org_invites')
        .select('*')
        .eq('org_id', ws.orgId)
        .is('accepted_at', null)
        .then(({ data }) => setInvites((data ?? []) as OrgInviteRow[]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.orgId, isAdmin]);

  async function createInvite() {
    if (!email.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('org_invites')
      .insert({ org_id: ws.orgId, email: email.trim(), created_by: ws.userId })
      .select('*')
      .single();
    setBusy(false);
    if (error) return toast(`Error: ${error.message}`);
    setInvites((prev) => [...prev, data as OrgInviteRow]);
    setEmail('');
    void copyInvite(data as OrgInviteRow);
  }

  async function copyInvite(inv: OrgInviteRow) {
    const url = `${location.origin}/invite/${inv.token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Invite link copied — send it to your teammate');
    } catch {
      prompt('Copy this invite link:', url);
    }
  }

  async function revokeInvite(inv: OrgInviteRow) {
    const { error } = await supabase.from('org_invites').delete().eq('id', inv.id);
    if (error) return toast(`Error: ${error.message}`);
    setInvites((prev) => prev.filter((x) => x.id !== inv.id));
    toast('Invite revoked');
  }

  return (
    <Card className="mb-3">
      <p className="font-semibold mb-1.5 flex items-center gap-1.5">
        <IconUsers /> Team
      </p>
      <p className="text-xs text-ink2 mb-2">
        {members.length} member{members.length === 1 ? '' : 's'} in this workspace. Seats are per
        company — everyone shares the same territory and pipeline.
      </p>
      {isAdmin ? (
        <>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="teammate@company.com"
              className="h-9 flex-1 border border-line2 rounded-md px-2.5 text-[13px] outline-none focus:border-accent"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button className="!h-9 !text-xs" disabled={busy} onClick={() => void createInvite()}>
              Create invite link
            </Button>
          </div>
          {invites.length > 0 && (
            <div className="mt-2.5">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-2 text-xs py-1.5 border-b border-dashed border-line last:border-0"
                >
                  <span className="flex-1 truncate">{inv.email}</span>
                  <Ghost onClick={() => void copyInvite(inv)}>Copy link</Ghost>
                  <Ghost onClick={() => void revokeInvite(inv)}>
                    <IconTrash />
                  </Ghost>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-ink3 mt-2">
            Invites are shareable links (valid 14 days) — send by text or email. No email service is
            wired up yet, so the link is the invite.
          </p>
        </>
      ) : (
        <p className="text-xs text-ink3">Ask a workspace owner/admin to invite teammates.</p>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const ws = useWorkspace();
  // Text of in-progress numeric edits (so typing "0." isn't clobbered by the
  // parsed value); the workspace settings remain the source of truth.
  const [drafts, setDrafts] = useState<Partial<Record<keyof ScoringSettings, string>>>({});

  if (ws.loading) return <Loading />;

  // While a field is being edited we show the raw typed text (so "0." isn't
  // clobbered by the parsed number); ws.settings stays the source of truth.
  const display = (k: keyof ScoringSettings) => drafts[k] ?? String(ws.settings[k]);

  function onChange(k: keyof ScoringSettings, v: string) {
    setDrafts((d) => ({ ...d, [k]: v }));
    ws.saveSettings({
      ...ws.settings,
      [k]: TEXT_KEYS.has(k) ? v : parseFloat(v) || 0,
    } as ScoringSettings);
  }

  function onBlur(k: keyof ScoringSettings) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[k];
      return next;
    });
  }

  function onSwitchMode(mode: ServiceMode) {
    setDrafts({});
    ws.saveSettings({ ...ws.settings, ...defaultsForMode(mode) } as ScoringSettings);
  }

  const blockProps = { display, onChange, onBlur };
  const isResidential = ws.settings.serviceMode === 'residential';
  const algorithmFields = isResidential
    ? ALGORITHM_SHARED
    : [...ALGORITHM_COMMERCIAL_ONLY, ...ALGORITHM_SHARED];
  const pricingFields = isResidential ? PRICING_RESIDENTIAL : PRICING_COMMERCIAL;

  return (
    <div>
      <p className="text-base font-semibold mb-1">Team settings</p>
      <p className="text-[12.5px] text-ink2 mb-3">
        Shared — changes apply to everyone&apos;s scores and outreach. Scores recompute instantly.
      </p>
      <ServiceModeBlock mode={ws.settings.serviceMode} onSwitch={onSwitchMode} />
      <div className="grid lg:grid-cols-2 gap-x-3 items-start">
        <div>
          <SettingsBlock title="Identity & outreach" fields={IDENTITY} {...blockProps} />
          <SettingsBlock title="Territory & locality" fields={TERRITORY} {...blockProps} />
          <TeamSection />
        </div>
        <div>
          <SettingsBlock title="PaneScore algorithm" fields={algorithmFields} {...blockProps} />
          <SettingsBlock
            title={isResidential ? 'Pricing model (residential)' : 'Pricing model (commercial)'}
            fields={pricingFields}
            {...blockProps}
          />
        </div>
      </div>
    </div>
  );
}
