#!/usr/bin/env node
/**
 * build_cities.js — LetsGoPlay data splitter
 *
 * Strategy:
 *  - Named cities (bboxes below) produce dedicated files, e.g. data/raanana.json
 *  - Everything else is split into 0.5° geographic grid tiles, e.g. data/tile_5_1.json
 *  - A manifest.json lists all files + their bboxes so index.html can pick the
 *    right files for the user's location without fetching the full dataset.
 *
 * Future ArcGIS cities: drop in data/<citykey>.json with "source":"arcgis" and
 * update manifest.json — no index.html changes needed.
 *
 * Usage:  node build_cities.js
 *
 * IMPORTANT: City files already present with "source":"arcgis" are NOT overwritten.
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ── Named cities (precise bboxes — overridden by ArcGIS data when available) ──
// bbox: [latMin, latMax, lngMin, lngMax]
const NAMED_CITIES = [
  { key: 'tel_aviv',       name: 'תל אביב',       bbox: [32.020, 32.130, 34.730, 34.840] },
  { key: 'raanana',        name: 'רעננה',          bbox: [32.160, 32.230, 34.840, 34.910] },
  { key: 'jerusalem',      name: 'ירושלים',        bbox: [31.690, 31.870, 35.140, 35.290] },
  { key: 'haifa',          name: 'חיפה',           bbox: [32.740, 32.860, 34.940, 35.080] },
  { key: 'beer_sheva',     name: 'באר שבע',        bbox: [31.180, 31.300, 34.750, 34.870] },
  { key: 'netanya',        name: 'נתניה',          bbox: [32.260, 32.380, 34.820, 34.930] },
  { key: 'petah_tikva',    name: 'פתח תקווה',      bbox: [32.040, 32.130, 34.840, 34.940] },
  { key: 'rishon',         name: 'ראשון לציון',    bbox: [31.930, 32.040, 34.760, 34.870] },
  { key: 'ashdod',         name: 'אשדוד',          bbox: [31.760, 31.870, 34.600, 34.720] },
  { key: 'ashkelon',       name: 'אשקלון',         bbox: [31.620, 31.730, 34.530, 34.640] },
  { key: 'rehovot',        name: 'רחובות',         bbox: [31.860, 31.950, 34.770, 34.860] },
  { key: 'herzliya',       name: 'הרצליה',         bbox: [32.130, 32.200, 34.800, 34.890] },
  { key: 'holon',          name: 'חולון',          bbox: [31.980, 32.060, 34.750, 34.840] },
  { key: 'kfar_saba',      name: 'כפר סבא',        bbox: [32.150, 32.230, 34.870, 34.950] },
  { key: 'modiin',         name: 'מודיעין',        bbox: [31.870, 31.960, 34.980, 35.090] },
  { key: 'eilat',          name: 'אילת',           bbox: [29.460, 29.600, 34.900, 35.000] },
  { key: 'nahariya',       name: 'נהריה',          bbox: [32.980, 33.050, 35.060, 35.140] },
];

// ── Grid constants (covers all Israel) ───────────────────────────────────────
const STEP    = 0.5;
const LAT_MIN = 26.0;   // covers Eilat and south
const LNG_MIN = 33.0;   // covers west coast

function tileKey(lat, lng) {
  const row = Math.max(0, Math.floor((lat - LAT_MIN) / STEP));
  const col = Math.max(0, Math.floor((lng - LNG_MIN) / STEP));
  return `tile_${row}_${col}`;
}

function tileBbox(key) {
  const [, r, c] = key.split('_').map(Number);
  return {
    latMin: LAT_MIN + r * STEP,
    latMax: LAT_MIN + (r + 1) * STEP,
    lngMin: LNG_MIN + c * STEP,
    lngMax: LNG_MIN + (c + 1) * STEP,
  };
}

// Check if a point falls in a named city bbox
function namedCityForRecord(lat, lng) {
  for (const c of NAMED_CITIES) {
    if (lat >= c.bbox[0] && lat <= c.bbox[1] && lng >= c.bbox[2] && lng <= c.bbox[3]) {
      return c;
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const srcPath = path.join(__dirname, 'israel_data.json');
if (!fs.existsSync(srcPath)) {
  console.error('ERROR: israel_data.json not found in', __dirname);
  process.exit(1);
}

console.log('Reading israel_data.json...');
const data = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
console.log(`  Shelters:    ${data.shelters.length}`);
console.log(`  Playgrounds: ${data.playgrounds.length}`);

// Buckets
const cityBuckets = {};   // key → { shelters:[], playgrounds:[], meta:{} }
const tileBuckets = {};   // tileKey → { shelters:[], playgrounds:[] }

const getCity = key => {
  if (!cityBuckets[key]) cityBuckets[key] = { shelters: [], playgrounds: [] };
  return cityBuckets[key];
};
const getTile = key => {
  if (!tileBuckets[key]) tileBuckets[key] = { shelters: [], playgrounds: [] };
  return tileBuckets[key];
};

let cityMatchSh = 0, cityMatchPg = 0;

data.shelters.forEach(s => {
  const c = namedCityForRecord(s.lat, s.lng);
  if (c) { getCity(c.key).shelters.push(s); cityMatchSh++; }
  else    { getTile(tileKey(s.lat, s.lng)).shelters.push(s); }
});

data.playgrounds.forEach(p => {
  const c = namedCityForRecord(p.lat, p.lng);
  if (c) { getCity(c.key).playgrounds.push(p); cityMatchPg++; }
  else    { getTile(tileKey(p.lat, p.lng)).playgrounds.push(p); }
});

// ── Write output ──────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'data');
fs.mkdirSync(outDir, { recursive: true });

const manifestEntries = [];

// 1. Write named city files
for (const city of NAMED_CITIES) {
  const bucket = cityBuckets[city.key];
  if (!bucket || (bucket.shelters.length === 0 && bucket.playgrounds.length === 0)) continue;

  const outPath = path.join(outDir, `${city.key}.json`);

  // Protect ArcGIS-sourced files
  if (fs.existsSync(outPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (existing.source === 'arcgis') {
        console.log(`  SKIP ${city.key}.json (source:arcgis — protected)`);
        manifestEntries.push({
          key: city.key, name: city.name, type: 'city', source: 'arcgis',
          bbox: { latMin: city.bbox[0], latMax: city.bbox[1], lngMin: city.bbox[2], lngMax: city.bbox[3] },
          shelterCount: existing.shelters ? existing.shelters.length : 0,
          playgroundCount: existing.playgrounds ? existing.playgrounds.length : 0,
        });
        continue;
      }
    } catch(e) { /* corrupt — overwrite */ }
  }

  const payload = {
    key: city.key, name: city.name, type: 'city',
    source: 'existing', generatedAt: data.generatedAt,
    shelters: bucket.shelters, playgrounds: bucket.playgrounds,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`  wrote ${city.key}.json  (${bucket.shelters.length}sh + ${bucket.playgrounds.length}pg)`);
  manifestEntries.push({
    key: city.key, name: city.name, type: 'city', source: 'existing',
    bbox: { latMin: city.bbox[0], latMax: city.bbox[1], lngMin: city.bbox[2], lngMax: city.bbox[3] },
    shelterCount: bucket.shelters.length, playgroundCount: bucket.playgrounds.length,
  });
}

// 2. Write grid tile files
let tileCount = 0;
for (const [key, bucket] of Object.entries(tileBuckets)) {
  if (bucket.shelters.length === 0 && bucket.playgrounds.length === 0) continue;
  const bbox = tileBbox(key);
  const payload = {
    key, type: 'tile', source: 'existing', generatedAt: data.generatedAt,
    shelters: bucket.shelters, playgrounds: bucket.playgrounds,
  };
  fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(payload));
  manifestEntries.push({
    key, type: 'tile', source: 'existing', bbox,
    shelterCount: bucket.shelters.length, playgroundCount: bucket.playgrounds.length,
  });
  tileCount++;
}
console.log(`  wrote ${tileCount} grid tile files`);

// 3. Write manifest
const manifest = { generatedAt: data.generatedAt, step: STEP, latMin: LAT_MIN, lngMin: LNG_MIN, entries: manifestEntries };
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest));
console.log(`  wrote manifest.json  (${manifestEntries.length} entries: ${NAMED_CITIES.length} city slots + ${tileCount} tiles)`);

// ── Summary ───────────────────────────────────────────────────────────────────
const totalSh = data.shelters.length, totalPg = data.playgrounds.length;
console.log('\nSummary:');
console.log(`  Shelters in named cities:    ${cityMatchSh} / ${totalSh} (${(cityMatchSh/totalSh*100).toFixed(1)}%)`);
console.log(`  Playgrounds in named cities: ${cityMatchPg} / ${totalPg} (${(cityMatchPg/totalPg*100).toFixed(1)}%)`);
console.log(`  Grid tile records:           ${totalSh - cityMatchSh + totalPg - cityMatchPg}`);
console.log('\nDone. Commit the data/ folder to your repo.');
