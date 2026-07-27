import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isCommercial, isResidential } from '@/lib/scoring';
import { composeField, normalizeFeature, outFieldsFor } from '@/lib/counties/arcgis';
import type { CountyFieldMap, CountySource } from '@/lib/counties/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Inspect a discovered layer so it can be imported safely.
 *
 * A catalogued county ships with a hand-verified `where` clause. A discovered
 * one doesn't — every assessor codes land use differently ("Commercial",
 * "401: Com-Apartment", "C-2"), so we read the layer's *actual* distinct values,
 * pre-select the ones our classifier recognizes, and let the user confirm.
 * That produces a real server-side filter instead of downloading whole counties.
 *
 * Also returns sample rows through the same normalizer the import uses, so the
 * preview shows exactly what would be stored.
 */

const MAX_DISTINCT = 120;

interface Body {
  serviceUrl: string;
  fields: CountyFieldMap;
  mode?: 'commercial' | 'residential';
}

async function getJson(url: string, timeoutMs = 30_000): Promise<Record<string, unknown> | null> {
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

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { serviceUrl, fields } = body;
  if (!serviceUrl || !fields?.address) {
    return NextResponse.json({ error: 'Service URL and address field required.' }, { status: 400 });
  }
  if (!/^https:\/\/[\w.-]+\/.*\/(FeatureServer|MapServer)\/\d+$/i.test(serviceUrl)) {
    return NextResponse.json({ error: 'Unsupported service URL.' }, { status: 400 });
  }
  const mode = body.mode === 'residential' ? 'residential' : 'commercial';
  const base = serviceUrl.replace(/\/$/, '');

  // Distinct land-use values, so the user can pick what counts as in-scope.
  let landUseValues: string[] = [];
  let suggested: string[] = [];
  const landuseField = fields.landuse;
  if (landuseField && typeof landuseField === 'string') {
    const distinct = await getJson(
      `${base}/query?` +
        new URLSearchParams({
          where: '1=1',
          outFields: landuseField,
          returnDistinctValues: 'true',
          returnGeometry: 'false',
          f: 'json',
        }),
    );
    const feats = (distinct?.features as { attributes: Record<string, unknown> }[]) ?? [];
    landUseValues = [
      ...new Set(
        feats
          .map((f) => f.attributes?.[landuseField])
          .filter((v) => v != null && String(v).trim() !== '')
          .map((v) => String(v).trim()),
      ),
    ]
      .sort()
      .slice(0, MAX_DISTINCT);
    const match = mode === 'residential' ? isResidential : isCommercial;
    suggested = landUseValues.filter((v) => match(v));
  }

  // Sample rows through the real normalizer.
  const sample = await getJson(
    `${base}/query?` +
      new URLSearchParams({
        where: '1=1',
        outFields: outFieldsFor(fields).join(','),
        resultRecordCount: '5',
        returnGeometry: 'false',
        f: 'json',
      }),
  );
  const pseudoSource = { serviceUrl, fields } as CountySource;
  const sampleFeatures = (sample?.features as { attributes: Record<string, unknown> }[]) ?? [];
  const sampleRows = sampleFeatures
    .map((f) => normalizeFeature(f.attributes ?? {}, pseudoSource))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // What the layer actually holds, and roughly how much is in scope.
  const totalJson = await getJson(
    `${base}/query?` + new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' }),
  );
  const total = Number(totalJson?.count ?? 0);

  let inScope: number | null = null;
  if (landuseField && typeof landuseField === 'string' && suggested.length) {
    const clause = `${landuseField} IN (${suggested.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`;
    const c = await getJson(
      `${base}/query?` + new URLSearchParams({ where: clause, returnCountOnly: 'true', f: 'json' }),
    );
    inScope = c ? Number(c.count ?? 0) : null;
  }

  return NextResponse.json({
    landUseField: typeof landuseField === 'string' ? landuseField : null,
    landUseValues,
    suggested,
    sampleRows,
    total,
    inScope,
    // Preview only — the composed address proves the field mapping is right.
    sampleAddresses: sampleFeatures
      .slice(0, 3)
      .map((f) => composeField(f.attributes ?? {}, fields.address)),
  });
}
