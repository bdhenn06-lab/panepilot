// Hamilton County -> PanePilot import CSV.
//
// The county publishes ownership/value/land-use (Monthly_tax_information.xlsx,
// ~356k parcels countywide) and building characteristics (bldginfo.xlsx,
// mostly residential CAMA data) as two separate files with no coordinates in
// either. This script filters the tax file to commercial/industrial land-use
// codes (300-499, excluding vacant land), left-joins building sqft/stories/
// year-built where bldginfo.xlsx has a matching parcel ID (~9% of commercial
// parcels), and writes a single CSV shaped for PanePilot's column mapper.
// Parcels without a building match are left blank; PanePilot's estimator
// already assumes reasonable defaults from stories/sqft when either is missing.
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_PATH = path.join(DATA_DIR, 'hamilton-county-commercial.csv');

function isCommercialCode(code) {
  const n = Number(code);
  return n >= 300 && n <= 499;
}

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(fields) {
  return fields.map(csvField).join(',') + '\n';
}

async function loadBuildingIndex() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DATA_DIR, 'bldginfo.xlsx'));
  const ws = wb.worksheets[0];
  const idx = new Map();
  ws.eachRow({ includeEmpty: false }, (row, num) => {
    if (num === 1) return;
    const id = String(row.getCell(1).value || '').trim();
    if (!id) return;
    const attic = Number(row.getCell(2).value) || 0;
    const bsmt = Number(row.getCell(3).value) || 0;
    const liveFsqft = Number(row.getCell(4).value) || 0;
    const flr1 = Number(row.getCell(6).value) || 0;
    const flr2 = Number(row.getCell(7).value) || 0;
    const flrH = Number(row.getCell(8).value) || 0;
    const storyht = Number(row.getCell(9).value) || 0;
    const yearBuilt = Number(row.getCell(10).value) || 0;
    // Prefer finished living area; fall back to summed floor areas.
    const bldgSqft = liveFsqft || flr1 + flr2 + flrH || 0;
    idx.set(id, { bldgSqft, stories: storyht, yearBuilt, attic, bsmt });
  });
  return idx;
}

function fullAddress(v) {
  const parts = [v[19], v[20], v[21], v[22]].filter(Boolean); // house#, dir, name, suffix
  return parts.join(' ').trim();
}

async function main() {
  console.log('Loading building characteristics index...');
  const bldgIndex = await loadBuildingIndex();
  console.log(`  ${bldgIndex.size} building records indexed.`);

  const out = fs.createWriteStream(OUT_PATH, { encoding: 'utf8' });
  out.write(
    csvRow([
      'parcelid', 'address', 'city', 'zip', 'owner', 'mailing', 'landuse',
      'bldgsqft', 'stories', 'value', 'yearbuilt',
    ]),
  );

  console.log('Streaming tax information, filtering to commercial/industrial...');
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(
    path.join(DATA_DIR, 'Monthly_tax_information.xlsx'),
    { entries: 'emit', sharedStrings: 'cache', worksheets: 'emit' },
  );

  let scanned = 0;
  let kept = 0;
  let vacantSkipped = 0;
  let bldgMatched = 0;
  let locationFallback = 0;

  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      const num = row.number;
      if (num === 1) continue;
      scanned++;
      const v = row.values;
      const classCode = v[8];
      const classDesc = String(v[9] || '');
      if (!isCommercialCode(classCode)) continue;
      if (/VACANT LAND/i.test(classDesc)) {
        vacantSkipped++;
        continue;
      }

      const parcelId = String(v[1] || '').trim();
      const address = fullAddress(v);
      if (!address) continue;

      let city = v[23]; // location_city
      let zip = v[25]; // location_zip
      if (!city && !zip) {
        city = v[16]; // owner_city fallback
        zip = v[18]; // owner_zip fallback
        locationFallback++;
      }

      const owner = v[12] || '';
      const mailingParts = [v[28], v[30], v[31]].filter(Boolean); // mail addr1, city, state
      const mailingZip = v[32] ? String(v[32]).slice(0, 5) : '';
      const mailing = [mailingParts.join(', '), mailingZip].filter(Boolean).join(' ');

      const bldg = bldgIndex.get(parcelId);
      if (bldg) bldgMatched++;

      out.write(
        csvRow([
          parcelId,
          address,
          city || '',
          zip ? String(zip).slice(0, 5) : '',
          owner,
          mailing,
          classDesc,
          bldg && bldg.bldgSqft ? bldg.bldgSqft : '',
          bldg && bldg.stories ? bldg.stories : '',
          v[57] || '', // total_market_value
          bldg && bldg.yearBuilt ? bldg.yearBuilt : '',
        ]),
      );
      kept++;
    }
    break;
  }
  out.end();

  console.log(`\nScanned ${scanned} parcels.`);
  console.log(`Kept ${kept} commercial/industrial parcels (excluded ${vacantSkipped} vacant land).`);
  console.log(`  ${bldgMatched} (${((bldgMatched / kept) * 100).toFixed(1)}%) matched a building record.`);
  console.log(`  ${locationFallback} used owner city/zip as a fallback for missing location city/zip.`);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
