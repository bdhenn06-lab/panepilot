'use client';

import Papa from 'papaparse';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWorkspace } from '@/components/workspace';
import { useToast } from '@/components/toast';
import { Button, Callout, Card, Ghost } from '@/components/ui';
import { IconTrash, IconUpload } from '@/components/icons';
import { Loading } from '@/components/loading';
import { CountyPicker } from '@/components/county-picker';
import { remapPipeline, snapshotPipeline, type PipelineSnapshot } from '@/lib/carryover';
import type { TablesInsert } from '@/lib/db/database.types';
import {
  IMPORT_FIELDS,
  detectLocality,
  guessColumns,
  isCommercial,
  isResidential,
  ownerKey,
  parseNum,
  formatNum,
  type ImportField,
} from '@/lib/scoring';

type Mapping = Record<ImportField, string>;
type CsvRow = Record<string, string>;

const BATCH = 500;

function toNumeric(v: string | undefined): number | null {
  if (v == null || String(v).trim() === '') return null;
  const n = parseNum(v);
  return n || null;
}

export default function ImportPage() {
  const ws = useWorkspace();
  const toast = useToast();
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [sampleRows, setSampleRows] = useState<CsvRow[]>([]);
  const [hot, setHot] = useState(false);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (ws.loading) return <Loading />;

  const isResidentialOrg = ws.settings.serviceMode === 'residential';
  const targetLabel = isResidentialOrg ? 'residential' : 'commercial';
  const matchesTarget = isResidentialOrg ? isResidential : isCommercial;
  const hasExisting = ws.parcels.length > 0;
  // Show what the current mapping actually pulls out of the file, so a
  // mis-detected column is obvious before it becomes 25k bad rows.
  const previewRows = sampleRows.slice(0, 3);
  const previewFields = mapping ? IMPORT_FIELDS.filter(([field]) => mapping[field]) : [];

  function handleFile(f: File) {
    setError('');
    Papa.parse<CsvRow>(f, {
      header: true,
      preview: 6,
      complete: (res) => {
        const h = res.meta.fields ?? [];
        if (!h.length) {
          setError('Could not read that as a CSV.');
          return;
        }
        setFile(f);
        setHeaders(h);
        setMapping(guessColumns(h));
        setSampleRows(res.data.filter((r) => Object.values(r).some((v) => String(v ?? '').trim())));
      },
    });
  }

  async function restorePipeline(
    snapshot: PipelineSnapshot,
    newIdByParcelNumber: Map<string, number>,
  ): Promise<number> {
    const { states, routeIds } = remapPipeline(snapshot, newIdByParcelNumber);
    for (let i = 0; i < states.length; i += BATCH) {
      const rows = states.slice(i, i + BATCH).map(({ parcelId, state }) => ({
        parcel_id: parcelId,
        org_id: ws.orgId,
        status: state.status,
        touch: state.touch,
        last_touch: state.lastTouch || null,
        due: state.due || null,
        notes: state.notes,
        updated_by: ws.userId,
        updated_at: new Date().toISOString(),
      }));
      const { error: upErr } = await supabase.from('prospect_state').upsert(rows);
      if (upErr) throw new Error(`Restoring pipeline: ${upErr.message}`);
    }
    const { data: routeRow } = await supabase
      .from('routes')
      .select('id')
      .eq('org_id', ws.orgId)
      .limit(1)
      .maybeSingle();
    if (routeRow) {
      await supabase
        .from('routes')
        .update({ stops: routeIds, updated_at: new Date().toISOString() })
        .eq('id', routeRow.id);
    } else if (routeIds.length) {
      await supabase.from('routes').insert({ org_id: ws.orgId, stops: routeIds, created_by: ws.userId });
    }
    return states.length;
  }

  /**
   * Fill in the workspace's market from the parcels just imported — the state
   * appended to addresses and the local-owner markers used by the buyer-signal
   * score. Only fills fields the team hasn't set themselves, so it never
   * overwrites a deliberate choice. Written directly (not via the debounced
   * saveSettings) so the refresh below reads the new values.
   */
  async function applyDetectedLocality(
    rows: TablesInsert<'parcels'>[],
    fallbackState?: string,
  ): Promise<string> {
    const s = ws.settings;
    if (s.regionState && s.localState && s.localCity && s.localZipPrefix) return '';
    const detected = detectLocality(
      rows.map((r) => ({ address: r.address, city: r.city ?? null, zip: r.zip ?? null })),
    );
    // Some sources (Ohio's statewide layer) publish no ZIPs, so the state can't
    // be inferred from the data — but a catalogued county already knows it.
    const regionState = detected?.regionState || fallbackState || '';
    if (!detected && !regionState) return '';

    const { error: setErr } = await supabase
      .from('org_settings')
      .update({
        region_state: s.regionState || regionState,
        local_state: s.localState || detected?.localState || regionState,
        local_city: s.localCity || detected?.localCity || '',
        local_zip_prefix: s.localZipPrefix || detected?.localZipPrefix || '',
      })
      .eq('org_id', ws.orgId);
    if (setErr) return '';
    const where = [detected?.localCity, regionState].filter(Boolean).join(', ');
    return where ? `market set to ${where}` : '';
  }

  /**
   * The one commit path, shared by the CSV upload and the county picker:
   * snapshot the pipeline, swap the dataset, reattach statuses/notes/routes,
   * then fill in the workspace's market.
   */
  async function commitRows(
    rows: TablesInsert<'parcels'>[],
    sourceLabel: string,
    fallbackState?: string,
  ) {
    if (!rows.length) {
      setError(`No ${targetLabel} rows with an address were found. Check the mapping or source.`);
      return;
    }

    // Carryover: snapshot the pipeline before touching anything.
    const snapshot = hasExisting ? snapshotPipeline(ws.parcels, ws.states, ws.route) : null;
    if (hasExisting) {
      const carried = snapshot!.states.size;
      const hasParcelIds = rows.some((r) => r.parcel_number);
      const note = !hasParcelIds
        ? 'These rows carry no parcel IDs, so nothing can carry over — all statuses and notes will be lost.'
        : carried
          ? `${carried} statuses/notes will carry over automatically by parcel ID.`
          : 'No statuses or notes exist yet, nothing to carry over.';
      if (
        !confirm(
          `Replace the current ${formatNum(ws.parcels.length)} parcels with ${formatNum(rows.length)} from "${sourceLabel}"?\n\n${note}`,
        )
      )
        return;
    }

    setBusy(true);
    setError('');
    try {
      if (hasExisting) {
        setProgress('Clearing previous dataset…');
        const { error: rpcErr } = await supabase.rpc('clear_org_parcels', { target_org: ws.orgId });
        if (rpcErr) throw new Error(rpcErr.message);
      }

      setProgress(`Uploading ${formatNum(rows.length)} parcels…`);
      const newIdByParcelNumber = new Map<string, number>();
      for (let i = 0; i < rows.length; i += BATCH) {
        const { data, error: insErr } = await supabase
          .from('parcels')
          .insert(rows.slice(i, i + BATCH))
          .select('id, parcel_number');
        if (insErr) throw new Error(`Upload error at row ${i}: ${insErr.message}`);
        for (const r of data ?? []) {
          const pn = (r.parcel_number as string | null)?.trim();
          if (pn && !newIdByParcelNumber.has(pn)) newIdByParcelNumber.set(pn, r.id as number);
        }
        setProgress(`Uploaded ${formatNum(Math.min(i + BATCH, rows.length))} / ${formatNum(rows.length)}…`);
      }

      let carried = 0;
      if (snapshot && (snapshot.states.size || snapshot.routeParcelNumbers.length)) {
        setProgress('Reattaching statuses, notes, and routes…');
        carried = await restorePipeline(snapshot, newIdByParcelNumber);
      }

      const detectedNote = await applyDetectedLocality(rows, fallbackState);

      setProgress('');
      await ws.refresh();
      setBusy(false);
      toast(
        [
          'Territory imported',
          carried ? `${formatNum(carried)} statuses/notes carried over` : '',
          detectedNote,
        ]
          .filter(Boolean)
          .join(' — '),
      );
      router.push('/dashboard');
    } catch (e) {
      setBusy(false);
      setProgress('');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Parse the chosen CSV with the confirmed mapping, then commit. */
  async function runImport() {
    if (!file || !mapping) return;
    if (!mapping.address) {
      setError('Address column is required.');
      return;
    }
    const m = mapping;

    setBusy(true);
    setError('');
    const kept: TablesInsert<'parcels'>[] = [];
    let seen = 0;

    await new Promise<void>((resolve) => {
      Papa.parse<CsvRow>(file, {
        header: true,
        step: (res) => {
          seen++;
          const row = res.data;
          if (m.landuse && !matchesTarget(row[m.landuse])) return;
          const address = (row[m.address] ?? '').trim();
          if (!address) return;
          kept.push({
            org_id: ws.orgId,
            address,
            city: m.city ? row[m.city] || null : null,
            zip: m.zip ? String(row[m.zip] ?? '').slice(0, 10) || null : null,
            owner_name: m.owner ? row[m.owner] || null : null,
            owner_key: m.owner ? ownerKey(row[m.owner]) || null : null,
            owner_mailing: m.mailing ? row[m.mailing] || null : null,
            land_use: m.landuse ? row[m.landuse] || null : null,
            bldg_sqft: m.bldgsqft ? toNumeric(row[m.bldgsqft]) : null,
            stories: m.stories ? toNumeric(row[m.stories]) : null,
            market_value: m.value ? toNumeric(row[m.value]) : null,
            year_built: m.yearbuilt ? Math.round(toNumeric(row[m.yearbuilt]) ?? 0) || null : null,
            lat: m.lat ? toNumeric(row[m.lat]) : null,
            lon: m.lon ? toNumeric(row[m.lon]) : null,
            parcel_number: m.parcelid ? row[m.parcelid] || null : null,
          });
          if (seen % 5000 === 0)
            setProgress(`Scanned ${formatNum(seen)}, kept ${formatNum(kept.length)}…`);
        },
        complete: () => resolve(),
        error: () => resolve(),
      });
    });

    // Nothing is cleared until the new data has proven parseable.
    setBusy(false);
    setProgress('');
    await commitRows(kept, file.name);
  }

  async function clearWorkspace() {
    if (
      !confirm(
        'Delete all parcels AND all team statuses/notes for this workspace? This cannot be undone.',
      )
    )
      return;
    const { error: rpcErr } = await supabase.rpc('clear_org_parcels', { target_org: ws.orgId });
    if (rpcErr) {
      toast(`Error: ${rpcErr.message}`);
      return;
    }
    await ws.refresh();
    toast('Workspace cleared');
  }

  const isAdmin = ws.role !== 'member';

  return (
    <div>
      <p className="text-base font-semibold mb-1">
        {hasExisting ? 'Team data' : 'Load county parcel data (one time, for the whole team)'}
      </p>

      {hasExisting && !file && (
        <>
          <Callout tone="ok">
            <b>
              {formatNum(ws.parcels.length)} {targetLabel} parcels
            </b>{' '}
            in the shared workspace — every teammate sees the same scored territory.
          </Callout>
          <Callout tone="warn">
            Dropping a fresher county export below replaces the dataset. Statuses, notes, and routes
            carry over automatically for parcels with matching parcel IDs.
          </Callout>
          {!isAdmin && (
            <p className="text-xs text-ink3 mt-2">
              Only workspace owners/admins can replace the dataset.
            </p>
          )}
        </>
      )}

      {!file && (!hasExisting || isAdmin) && (
        <CountyPicker
          mode={isResidentialOrg ? 'residential' : 'commercial'}
          orgId={ws.orgId}
          disabled={busy}
          onRows={(rows, label, state) => void commitRows(rows, label, state)}
        />
      )}

      {!file && (!hasExisting || isAdmin) && (
        <p className="text-[12.5px] text-ink2 mb-2 mt-4">
          <b>Or upload a CSV.</b> Use this when your county isn&apos;t reachable above, or when you
          have a richer export (a prepared file with building sizes beats most public services).
          Parsing happens in your browser; only the {targetLabel} rows upload.
        </p>
      )}

      {!file && (!hasExisting || isAdmin) && (
        <div
          className={`mt-3 border-2 border-dashed rounded-xl p-7 text-center text-ink2 cursor-pointer ${
            hot ? 'border-accent bg-accent-soft' : 'border-line2'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHot(false);
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
          }}
        >
          <IconUpload width={26} height={26} className="mx-auto" />
          <p className="font-semibold mt-1.5">
            {hasExisting ? 'Drop a fresher county CSV here' : 'Drop county CSV here'}
          </p>
          <p className="text-xs">or click to browse (100MB+ files are fine — nothing raw uploads)</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFile(e.target.files[0]);
            }}
          />
        </div>
      )}

      {file && mapping && (
        <Card className="mt-3.5">
          <p className="font-semibold mb-2">Map columns from {file.name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {IMPORT_FIELDS.map(([field, label]) => (
              <div key={field}>
                <label className="text-xs font-semibold">{label}</label>
                <select
                  className="w-full h-8 border border-line2 rounded-md text-xs bg-panel px-1.5"
                  value={mapping[field]}
                  onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                >
                  <option value="">— not in file —</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {previewFields.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink3 mb-1">
                PREVIEW — first {previewRows.length} row{previewRows.length === 1 ? '' : 's'} as
                mapped
              </p>
              <div className="overflow-x-auto border border-line rounded-lg">
                <table className="w-full border-collapse text-[11.5px] whitespace-nowrap">
                  <thead>
                    <tr>
                      {previewFields.map(([field, label]) => (
                        <th
                          key={field}
                          className="text-left font-semibold text-ink3 px-2 py-1.5 border-b border-line bg-soft"
                        >
                          {label.replace(' *', '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {previewFields.map(([field]) => (
                          <td
                            key={field}
                            className="px-2 py-1.5 border-b border-line last:border-0 max-w-[180px] truncate"
                          >
                            {row[mapping[field]] || <span className="text-ink3">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-ink3 mt-1">
                Check these look right before importing. Anything mis-mapped, fix it above.
              </p>
            </div>
          )}

          {hasExisting && !mapping.parcelid && (
            <Callout tone="warn">
              Map the Parcel ID column to carry statuses and notes over from the current dataset.
            </Callout>
          )}
          {!mapping.landuse && (
            <Callout tone="warn">
              No land use column mapped, so every row imports instead of just {targetLabel}{' '}
              properties.
            </Callout>
          )}
          {!mapping.bldgsqft && !mapping.stories && (
            <Callout tone="warn">
              Neither building sq ft nor stories is mapped — every price will fall back to
              assumptions rather than the building&apos;s real size.
            </Callout>
          )}
          {!mapping.zip && (
            <Callout tone="warn">
              No ZIP column mapped. Route-density scoring and automatic market detection both rely
              on it.
            </Callout>
          )}
          <div className="flex gap-2 mt-3 items-center flex-wrap">
            <Button disabled={busy} onClick={() => void runImport()}>
              <IconUpload />
              {hasExisting ? 'Replace dataset (carry pipeline over)' : 'Import to team workspace'}
            </Button>
            <Ghost
              disabled={busy}
              onClick={() => {
                setFile(null);
                setMapping(null);
                setSampleRows([]);
                setProgress('');
              }}
            >
              Pick a different file
            </Ghost>
            {progress && <span className="text-[12.5px] text-ink2">{progress}</span>}
          </div>
        </Card>
      )}

      {hasExisting && !file && isAdmin && (
        <Ghost className="mt-4" onClick={() => void clearWorkspace()}>
          <IconTrash />
          Clear workspace entirely
        </Ghost>
      )}
      {error && <Callout tone="bad">{error}</Callout>}
    </div>
  );
}
