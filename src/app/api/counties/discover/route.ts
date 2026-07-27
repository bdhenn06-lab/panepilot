import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { guessColumns } from '@/lib/scoring';
import type { CountyFieldMap } from '@/lib/counties/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Live discovery for counties that aren't in the curated catalog.
 *
 * Searches the ArcGIS catalog, then *introspects* each candidate layer's field
 * list and auto-maps it with the same guesser the CSV importer uses. It
 * deliberately stops short of importing: the catalog is noisy (searches surface
 * consultant republications, neighbouring counties and decade-old snapshots),
 * so the user confirms a candidate against real sample rows first.
 */

const SEARCH_URL = 'https://www.arcgis.com/sharing/rest/search';

interface AgolItem {
  id: string;
  title: string;
  owner: string;
  type: string;
  url?: string;
  numViews?: number;
  modified?: number;
}

interface Candidate {
  title: string;
  owner: string;
  serviceUrl: string;
  layerName: string;
  fields: CountyFieldMap;
  coverage: { owner: boolean; bldgSqft: boolean; value: boolean; zip: boolean };
  fieldNames: string[];
  /** Heuristic confidence so obviously-wrong hits sort last. */
  score: number;
}

async function getJson(url: string, timeoutMs = 12_000): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return j.error ? null : j;
  } catch {
    return null;
  }
}

/** Turn the CSV guesser's output into a county field map. */
function toFieldMap(headers: string[]): CountyFieldMap | null {
  const g = guessColumns(headers);
  if (!g.address) return null;
  const map: CountyFieldMap = { address: g.address };
  const optional = [
    'parcelid', 'city', 'zip', 'owner', 'mailing', 'landuse', 'bldgsqft', 'stories', 'value', 'yearbuilt',
  ] as const;
  for (const k of optional) {
    const v = g[k];
    if (v) map[k] = v;
  }
  return map;
}

/** Resolve a service root to a queryable parcel-ish layer. */
async function resolveLayer(
  serviceUrl: string,
): Promise<{ url: string; name: string; fields: string[] } | null> {
  const base = serviceUrl.replace(/\/$/, '');
  // Already a layer URL?
  if (/\/(FeatureServer|MapServer)\/\d+$/i.test(base)) {
    const meta = await getJson(`${base}?f=json`);
    if (!meta) return null;
    return {
      url: base,
      name: String(meta.name ?? 'Layer'),
      fields: ((meta.fields as { name: string }[]) ?? []).map((f) => f.name),
    };
  }
  const svc = await getJson(`${base}?f=json`);
  if (!svc) return null;
  const layers = (svc.layers as { id: number; name: string }[] | undefined) ?? [];
  // Prefer a layer that looks like parcels; otherwise take the first.
  const pick = layers.find((l) => /parcel|propert/i.test(l.name)) ?? layers[0];
  if (!pick) return null;
  const meta = await getJson(`${base}/${pick.id}?f=json`);
  if (!meta) return null;
  return {
    url: `${base}/${pick.id}`,
    name: String(meta.name ?? pick.name),
    fields: ((meta.fields as { name: string }[]) ?? []).map((f) => f.name),
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const county = (params.get('county') ?? '').trim();
  const state = (params.get('state') ?? '').trim();
  if (!county) return NextResponse.json({ error: 'County name required.' }, { status: 400 });

  // Relevance order, and no state token in the query: sorting by popularity
  // surfaces well-viewed but unrelated layers (EV charging stations outranked
  // the actual Maricopa parcel layer), and adding the state depresses the
  // match for services that spell it out ("...County, Arizona").
  const q = `${county} County parcels`.trim();
  const searchUrl = `${SEARCH_URL}?` + new URLSearchParams({ q, f: 'json', num: '20' });

  const search = await getJson(searchUrl, 20_000);
  if (!search) {
    return NextResponse.json({ error: 'Could not reach the ArcGIS catalog.' }, { status: 502 });
  }

  const countyRe = new RegExp(county.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  /**
   * Cheap title-only ranking, applied before the expensive introspection so the
   * budget is spent on plausible layers. Catalog results for a county routinely
   * include permits, violations and EV chargers.
   */
  const preScore = (r: AgolItem): number => {
    const t = r.title ?? '';
    let s = 0;
    if (countyRe.test(t)) s += 3;
    if (/parcel/i.test(t)) s += 3;
    else if (/propert|tax|assess|cadastr/i.test(t)) s += 1;
    if (state && new RegExp(`\\b${state}\\b`, 'i').test(t)) s += 1;
    if (/violation|permit|charging|zoning|school|flood|tornado|inspection|crash|election/i.test(t)) {
      s -= 5;
    }
    return s;
  };

  const items = ((search.results as AgolItem[]) ?? [])
    .filter((r) => (r.type === 'Feature Service' || r.type === 'Map Service') && r.url)
    .sort((a, b) => preScore(b) - preScore(a));

  // Introspect the most promising few in parallel — introspecting every hit
  // would blow the function's time budget.
  const inspected = await Promise.all(
    items.slice(0, 6).map(async (item): Promise<Candidate | null> => {
      const layer = await resolveLayer(item.url!);
      if (!layer || !layer.fields.length) return null;
      const fields = toFieldMap(layer.fields);
      if (!fields) return null; // no address column => unusable

      const coverage = {
        owner: Boolean(fields.owner),
        bldgSqft: Boolean(fields.bldgsqft),
        value: Boolean(fields.value),
        zip: Boolean(fields.zip),
      };

      // Confidence: attribute richness, plus whether the title actually names
      // the county the user asked for (guards against neighbouring-county hits).
      const titleMatch = countyRe.test(item.title) ? 3 : 0;
      const stateMatch = state && new RegExp(`\\b${state}\\b`, 'i').test(item.title) ? 1 : 0;
      const richness =
        (coverage.owner ? 4 : 0) +
        (coverage.bldgSqft ? 3 : 0) +
        (coverage.value ? 2 : 0) +
        (coverage.zip ? 1 : 0) +
        (fields.landuse ? 2 : 0);

      return {
        title: item.title,
        owner: item.owner,
        serviceUrl: layer.url,
        layerName: layer.name,
        fields,
        coverage,
        fieldNames: layer.fields,
        score: richness + titleMatch + stateMatch,
      };
    }),
  );

  const candidates = inspected
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ candidates });
}
