import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildQueryUrl, normalizeFeature, PAGE_SIZE, type ServiceMode } from '@/lib/counties/arcgis';
import { findSource, searchSources } from '@/lib/counties/registry';
import type { CountySource } from '@/lib/counties/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * County parcel proxy.
 *
 * GET  — list/search the catalog for the picker.
 * POST — fetch one page of normalized parcels from a county's ArcGIS service.
 *
 * Going through our own route (rather than calling ArcGIS from the browser)
 * sidesteps CORS on the many county servers that don't send the headers, and
 * keeps each request short enough for a serverless function — the client drives
 * the paging loop so a 40k-parcel county never blocks on one long call.
 *
 * Auth-gated so this can't be used as an open relay against county servers.
 */

interface ArcGisFeature {
  attributes: Record<string, unknown>;
}

async function fetchArcGis(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // County servers can be slow; fail rather than hang the function.
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`County service returned ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error as { message?: string } | undefined;
  if (err) throw new Error(err.message || 'County service rejected the query');
  return json;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const q = new URL(request.url).searchParams.get('q') ?? '';
  const sources = searchSources(q)
    .slice(0, 50)
    .map((s) => ({
      id: s.id,
      label: s.label,
      state: s.state,
      county: s.county,
      coverage: s.coverage,
      note: s.note,
    }));
  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: {
    sourceId?: string;
    source?: CountySource;
    mode?: ServiceMode;
    offset?: number;
    countOnly?: boolean;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Either a catalog id, or a full source object produced by discovery (which
  // the user has already previewed and confirmed).
  const source = body.sourceId ? findSource(body.sourceId) : body.source;
  if (!source) return NextResponse.json({ error: 'Unknown county source.' }, { status: 400 });
  if (!/^https:\/\/[\w.-]+\/.*\/(FeatureServer|MapServer)\/\d+$/i.test(source.serviceUrl)) {
    return NextResponse.json({ error: 'Unsupported service URL.' }, { status: 400 });
  }

  const mode: ServiceMode = body.mode === 'residential' ? 'residential' : 'commercial';

  try {
    if (body.countOnly) {
      const json = await fetchArcGis(buildQueryUrl(source, { mode, countOnly: true }));
      return NextResponse.json({ count: Number(json.count ?? 0) });
    }

    const url = buildQueryUrl(source, {
      mode,
      offset: body.offset ?? 0,
      limit: Math.min(body.limit ?? PAGE_SIZE, PAGE_SIZE),
    });
    const json = await fetchArcGis(url);
    const features = (json.features as ArcGisFeature[] | undefined) ?? [];
    const parcels = features
      .map((f) => normalizeFeature(f.attributes ?? {}, source))
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return NextResponse.json({
      parcels,
      returned: features.length,
      exceededTransferLimit: Boolean(json.exceededTransferLimit),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'County service unreachable.' },
      { status: 502 },
    );
  }
}
