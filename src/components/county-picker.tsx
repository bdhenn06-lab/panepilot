'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Callout, Card, Ghost, Input } from '@/components/ui';
import { IconMap, IconUpload } from '@/components/icons';
import { formatNum, ownerKey } from '@/lib/scoring';
import type { CountyCoverage, CountyFieldMap, CountySource, NormalizedParcel } from '@/lib/counties/types';
import type { TablesInsert } from '@/lib/db/database.types';

/**
 * Pick a county and pull its parcels straight from the county's own GIS
 * service — no hunting for a CSV.
 *
 * Catalogued counties come with a hand-verified field mapping and filter.
 * Anything else goes through discovery, which finds candidate layers and makes
 * the user confirm real sample rows before importing, because the public
 * catalog is noisy enough to return the wrong county.
 */

interface CatalogEntry {
  id: string;
  label: string;
  state: string;
  county: string;
  coverage: CountyCoverage;
  note?: string;
}

interface Candidate {
  title: string;
  owner: string;
  serviceUrl: string;
  layerName: string;
  fields: CountyFieldMap;
  coverage: CountyCoverage;
}

interface InspectResult {
  landUseField: string | null;
  landUseValues: string[];
  suggested: string[];
  sampleRows: NormalizedParcel[];
  total: number;
  inScope: number | null;
}

const PAGE = 2000;

function CoverageBadges({ coverage }: { coverage: CountyCoverage }) {
  const items: Array<[keyof CountyCoverage, string]> = [
    ['owner', 'owner'],
    ['bldgSqft', 'building size'],
    ['value', 'value'],
    ['zip', 'ZIP'],
  ];
  return (
    <span className="flex gap-1 flex-wrap">
      {items.map(([key, label]) => (
        <span
          key={key}
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            coverage[key] ? 'bg-good-soft text-good' : 'bg-soft text-ink3 line-through'
          }`}
        >
          {label}
        </span>
      ))}
    </span>
  );
}

export function CountyPicker({
  mode,
  orgId,
  disabled,
  onRows,
}: {
  mode: 'commercial' | 'residential';
  orgId: string;
  disabled?: boolean;
  /** `state` lets the workspace set its market even when the source has no ZIPs. */
  onRows: (rows: TablesInsert<'parcels'>[], label: string, state?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  // Discovery
  const [discovering, setDiscovering] = useState(false);
  const [discCounty, setDiscCounty] = useState('');
  const [discState, setDiscState] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [chosenValues, setChosenValues] = useState<string[]>([]);

  const loadCatalog = useCallback(async (q: string) => {
    const res = await fetch(`/api/counties?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    setCatalog(data.sources ?? []);
  }, []);

  useEffect(() => {
    // Fetch-on-mount: setState happens after the await, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalog('');
  }, [loadCatalog]);

  /** Page through a source, normalizing into parcel rows. */
  async function pull(
    body: Record<string, unknown>,
    label: string,
    expected: number | null,
    state?: string,
  ) {
    setBusy(true);
    setError('');
    const rows: TablesInsert<'parcels'>[] = [];
    try {
      for (let offset = 0; ; offset += PAGE) {
        setProgress(
          expected
            ? `Fetching ${formatNum(Math.min(offset + PAGE, expected))} / ${formatNum(expected)}…`
            : `Fetching ${formatNum(offset)}…`,
        );
        const res = await fetch('/api/counties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, mode, offset, limit: PAGE }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const parcels = (data.parcels ?? []) as NormalizedParcel[];
        for (const p of parcels) {
          rows.push({
            org_id: orgId,
            address: p.address,
            city: p.city,
            zip: p.zip,
            owner_name: p.owner_name,
            owner_key: p.owner_name ? ownerKey(p.owner_name) || null : null,
            owner_mailing: p.owner_mailing,
            land_use: p.land_use,
            bldg_sqft: p.bldg_sqft,
            stories: p.stories,
            market_value: p.market_value,
            year_built: p.year_built,
            parcel_number: p.parcel_number,
            lat: null,
            lon: null,
          });
        }
        // A short page means the service has no more rows for this filter.
        if (!data.returned || data.returned < PAGE) break;
        // Safety valve so a misbehaving service can't loop forever.
        if (offset > 400_000) break;
      }
      setProgress('');
      setBusy(false);
      if (!rows.length) {
        setError('That source returned no matching parcels. Try the other service type or a CSV.');
        return;
      }
      onRows(rows, label, state);
    } catch (e) {
      setBusy(false);
      setProgress('');
      setError(e instanceof Error ? e.message : 'Could not reach the county service.');
    }
  }

  async function selectCounty(entry: CatalogEntry) {
    setSelected(entry);
    setCount(null);
    setError('');
    try {
      const res = await fetch('/api/counties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: entry.id, mode, countOnly: true }),
      });
      const data = await res.json();
      if (res.ok) setCount(data.count ?? 0);
      else setError(data.error || 'Could not read that county service.');
    } catch {
      setError('Could not reach the county service.');
    }
  }

  async function runDiscovery() {
    if (!discCounty.trim()) return;
    setBusy(true);
    setError('');
    setCandidates(null);
    setChosen(null);
    setInspect(null);
    try {
      const res = await fetch(
        `/api/counties/discover?county=${encodeURIComponent(discCounty)}&state=${encodeURIComponent(discState)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed.');
      setCandidates(data.candidates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }

  async function inspectCandidate(c: Candidate) {
    setChosen(c);
    setInspect(null);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/counties/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceUrl: c.serviceUrl, fields: c.fields, mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not inspect that layer.');
      setInspect(data);
      setChosenValues(data.suggested ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not inspect that layer.');
    } finally {
      setBusy(false);
    }
  }

  function importDiscovered() {
    if (!chosen || !inspect) return;
    const field = inspect.landUseField;
    const where =
      field && chosenValues.length
        ? `${field} IN (${chosenValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`
        : '1=1';
    const source: CountySource = {
      id: 'discovered',
      state: discState.toUpperCase().slice(0, 2) || 'XX',
      county: discCounty,
      label: chosen.title,
      serviceUrl: chosen.serviceUrl,
      fields: chosen.fields,
      where: { commercial: where, residential: where },
      coverage: chosen.coverage,
    };
    void pull({ source }, chosen.title, inspect.inScope, source.state);
  }

  return (
    <Card className="mb-3">
      <p className="font-semibold mb-1 flex items-center gap-1.5">
        <IconMap />
        Load straight from your county
      </p>
      <p className="text-xs text-ink2 mb-2.5">
        Pull parcels directly from the county&apos;s public GIS service — no download, no
        spreadsheet.
      </p>

      {!discovering && (
        <>
          <Input
            className="!h-9 !text-[13px]"
            placeholder="Search counties (e.g. Hamilton, Butler, Wake)"
            value={query}
            disabled={disabled || busy}
            onChange={(e) => {
              setQuery(e.target.value);
              void loadCatalog(e.target.value);
            }}
          />

          <div className="mt-2 max-h-56 overflow-y-auto border border-line rounded-lg divide-y divide-line">
            {catalog.length === 0 && (
              <p className="text-xs text-ink3 p-3">No catalogued county matches that search.</p>
            )}
            {catalog.map((entry) => (
              <button
                key={entry.id}
                disabled={disabled || busy}
                onClick={() => void selectCounty(entry)}
                className={`w-full text-left px-3 py-2 hover:bg-soft disabled:opacity-50 ${
                  selected?.id === entry.id ? 'bg-accent-soft' : ''
                }`}
              >
                <span className="text-[13px] font-medium">{entry.label}</span>
                <span className="block mt-0.5">
                  <CoverageBadges coverage={entry.coverage} />
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="mt-2.5">
              {selected.note && <Callout tone="warn">{selected.note}</Callout>}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <Button
                  disabled={disabled || busy || count === 0}
                  onClick={() =>
                    void pull({ sourceId: selected.id }, selected.label, count, selected.state)
                  }
                >
                  <IconUpload />
                  {count === null
                    ? 'Checking…'
                    : `Import ${formatNum(count)} ${mode} parcels`}
                </Button>
                {progress && <span className="text-[12.5px] text-ink2">{progress}</span>}
              </div>
            </div>
          )}

          <button
            className="text-xs text-accent-dark mt-2.5 underline"
            onClick={() => setDiscovering(true)}
            disabled={disabled || busy}
          >
            Don&apos;t see your county? Search for it →
          </button>
        </>
      )}

      {discovering && (
        <>
          <div className="flex gap-2">
            <Input
              className="!h-9 !text-[13px]"
              placeholder="County name (e.g. Franklin)"
              value={discCounty}
              disabled={busy}
              onChange={(e) => setDiscCounty(e.target.value)}
            />
            <Input
              className="!h-9 !text-[13px] !w-24"
              placeholder="State"
              value={discState}
              disabled={busy}
              onChange={(e) => setDiscState(e.target.value)}
            />
            <Button className="!h-9 !text-xs" disabled={busy} onClick={() => void runDiscovery()}>
              Search
            </Button>
          </div>
          <p className="text-[11px] text-ink3 mt-1.5">
            Searches public GIS catalogs. Results vary in quality, so check the sample rows before
            importing.
          </p>

          {candidates && candidates.length === 0 && (
            <Callout tone="warn">
              Nothing usable found. That county may not publish parcel data openly — the CSV upload
              below still works.
            </Callout>
          )}

          {candidates && candidates.length > 0 && !chosen && (
            <div className="mt-2 border border-line rounded-lg divide-y divide-line">
              {candidates.map((c) => (
                <button
                  key={c.serviceUrl}
                  disabled={busy}
                  onClick={() => void inspectCandidate(c)}
                  className="w-full text-left px-3 py-2 hover:bg-soft disabled:opacity-50"
                >
                  <span className="text-[13px] font-medium">{c.title}</span>
                  <span className="block text-[11px] text-ink3">
                    {c.layerName} · published by {c.owner}
                  </span>
                  <span className="block mt-0.5">
                    <CoverageBadges coverage={c.coverage} />
                  </span>
                </button>
              ))}
            </div>
          )}

          {chosen && inspect && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink3 mb-1">
                SAMPLE ROWS FROM {chosen.title.toUpperCase()}
              </p>
              <div className="overflow-x-auto border border-line rounded-lg">
                <table className="w-full text-[11.5px] whitespace-nowrap border-collapse">
                  <thead>
                    <tr className="bg-soft">
                      {['Address', 'City', 'Owner', 'Land use', 'Sq ft'].map((h) => (
                        <th key={h} className="text-left font-semibold text-ink3 px-2 py-1.5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspect.sampleRows.map((r, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-2 py-1.5 max-w-[200px] truncate">{r.address}</td>
                        <td className="px-2 py-1.5">{r.city ?? '—'}</td>
                        <td className="px-2 py-1.5 max-w-[160px] truncate">{r.owner_name ?? '—'}</td>
                        <td className="px-2 py-1.5 max-w-[160px] truncate">{r.land_use ?? '—'}</td>
                        <td className="px-2 py-1.5">{r.bldg_sqft ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-ink3 mt-1">
                {formatNum(inspect.total)} parcels in this layer.{' '}
                {inspect.inScope !== null && `${formatNum(inspect.inScope)} match the selection below.`}
              </p>

              {inspect.landUseField ? (
                <div className="mt-2.5">
                  <p className="text-xs font-semibold mb-1">
                    Which {inspect.landUseField} values count as {mode}?
                  </p>
                  <div className="max-h-40 overflow-y-auto border border-line rounded-lg p-2 flex flex-wrap gap-1">
                    {inspect.landUseValues.map((v) => {
                      const on = chosenValues.includes(v);
                      return (
                        <button
                          key={v}
                          onClick={() =>
                            setChosenValues((prev) =>
                              on ? prev.filter((x) => x !== v) : [...prev, v],
                            )
                          }
                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                            on
                              ? 'bg-accent-soft text-accent-dark border-accent'
                              : 'bg-panel text-ink2 border-line2'
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-ink3 mt-1">
                    Pre-selected using PanePilot&apos;s classifier — adjust if it missed something.
                  </p>
                </div>
              ) : (
                <Callout tone="warn">
                  No land use column was detected, so every parcel in the layer would import.
                </Callout>
              )}

              <div className="flex gap-2 mt-3 items-center flex-wrap">
                <Button disabled={busy} onClick={importDiscovered}>
                  <IconUpload />
                  Import from {chosen.title}
                </Button>
                <Ghost disabled={busy} onClick={() => setChosen(null)}>
                  Back to results
                </Ghost>
                {progress && <span className="text-[12.5px] text-ink2">{progress}</span>}
              </div>
            </div>
          )}

          <button
            className="text-xs text-accent-dark mt-2.5 underline"
            onClick={() => {
              setDiscovering(false);
              setCandidates(null);
              setChosen(null);
              setInspect(null);
            }}
            disabled={busy}
          >
            ← Back to the county list
          </button>
        </>
      )}

      {error && <Callout tone="bad">{error}</Callout>}
    </Card>
  );
}
