import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the free US Census Bureau batch geocoder.
 *
 * The parcels table stores addresses but no coordinates (most county exports
 * omit them), which leaves the map empty. The Census geocoder is free, needs
 * no API key, and covers every US address — but it doesn't send CORS headers,
 * so the browser can't call it directly. This route takes a batch of
 * addresses, forwards them, and returns id -> {lat, lon} for matches.
 *
 * It touches no database and needs no auth: the client (which already holds
 * the RLS-authenticated Supabase session) writes the coordinates back itself.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const CENSUS_URL =
  'https://geocoding.geo.census.gov/geocoder/locations/addressbatch';

interface AddressIn {
  id: number;
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface GeocodeOut {
  id: number;
  lat: number;
  lon: number;
}

/** Split a Census CSV line respecting double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export async function POST(request: Request) {
  let addresses: AddressIn[];
  try {
    const body = await request.json();
    addresses = body.addresses;
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ error: 'No addresses provided.' }, { status: 400 });
    }
    if (addresses.length > 5000) {
      return NextResponse.json({ error: 'Batch too large (max 5000).' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Census batch input: header-less CSV of id,street,city,state,zip.
  const csv = addresses
    .map((a) => {
      const cell = (v: string) => {
        const s = (v ?? '').replace(/"/g, '');
        return /[,]/.test(s) ? `"${s}"` : s;
      };
      return [a.id, cell(a.street), cell(a.city), cell(a.state), cell(a.zip)].join(',');
    })
    .join('\n');

  const form = new FormData();
  form.append('benchmark', 'Public_AR_Current');
  form.append('addressFile', new Blob([csv], { type: 'text/csv' }), 'addresses.csv');

  let text: string;
  try {
    const res = await fetch(CENSUS_URL, { method: 'POST', body: form });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Census geocoder returned ${res.status}.` },
        { status: 502 },
      );
    }
    text = await res.text();
  } catch (e) {
    return NextResponse.json(
      { error: `Geocoder unreachable: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 502 },
    );
  }

  // Census output columns: id, input, match, matchType, matchedAddr,
  // coordinates ("lon,lat"), tigerId, side. No header row.
  const results: GeocodeOut[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    const id = Number(cols[0]);
    const matched = cols[2] === 'Match';
    const coords = cols[5];
    if (!matched || !coords || Number.isNaN(id)) continue;
    const [lonStr, latStr] = coords.split(',');
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);
    if (Number.isFinite(lat) && Number.isFinite(lon)) results.push({ id, lat, lon });
  }

  return NextResponse.json({ results });
}
