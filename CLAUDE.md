# LetsGoPlay — Project Instructions

## Overview
**LetsGoPlay** (לטס גו פליי) — a single-file website that helps Israeli parents find playgrounds near bomb shelters.

## Deliverable
One file: `index.html` — all HTML, CSS, and JS inline. No framework, no build step.

## Project Structure
```
Ginavemiklat/
├── index.html          # The entire website (HTML + CSS + JS, ~1700 lines)
├── build_cities.js     # Node.js script: splits data into city/tile files
├── CLAUDE.md           # This file
├── data/
│   ├── manifest.json   # Index of all city + tile files
│   ├── raanana.json    # Per-city data file (17 named cities)
│   ├── tel_aviv.json
│   ├── ...             # Other city files
│   └── tile_*.json     # Geographic grid tiles (25 tiles, 0.5° × 0.5°)
└── archive/
    └── israel_data.json  # Original monolithic dataset (not used, kept for reference)
```

## Data Architecture

Data is split into per-city and per-grid-tile files for efficient loading (user only downloads what's near them).

### manifest.json
Master index loaded first. Lists all entries with bounding boxes and counts:
```json
{
  "generatedAt": "ISO date string",
  "step": 0.5,
  "latMin": 26,
  "lngMin": 33,
  "entries": [
    {
      "key": "raanana",
      "name": "רעננה",
      "type": "city",
      "source": "existing",
      "bbox": { "latMin": 32.16, "latMax": 32.23, "lngMin": 34.84, "lngMax": 34.91 },
      "shelterCount": 109,
      "playgroundCount": 155
    }
  ]
}
```

### City / tile files (`data/{key}.json`)
```json
{
  "key": "raanana",
  "name": "רעננה",
  "type": "city",
  "source": "existing",
  "generatedAt": "ISO date string",
  "shelters": [
    { "id": "string", "lat": number, "lng": number, "address": "string",
      "type": "above_ground" | "underground", "accessible": boolean,
      "source": "string", "city": "string" }
  ],
  "playgrounds": [
    { "id": "string", "lat": number, "lng": number,
      "name": "string", "address": "string", "source": "string" }
  ]
}
```

Many items have empty `name` / `address` — handle gracefully (fallback to city name or coordinates).

### Coverage
- **17 named cities**: tel_aviv, raanana, jerusalem, haifa, beer_sheva, netanya, petah_tikva, rishon, ashdod, ashkelon, rehovot, herzliya, holon, kfar_saba, modiin, eilat, nahariya
- **25 geographic grid tiles**: `tile_{row}_{col}` covering the rest of Israel at 0.5° resolution

## Data Loading (how index.html does it)

```
1. Fetch (or load from localStorage) manifest.json
   - localStorage key: 'letsgoplay_manifest'  (7-day TTL)

2. From manifest, determine which city/tile files cover the user's area
   - If no GPS yet: load the tile/city that contains the map's default view

3. Fetch needed city/tile files
   - localStorage key per file: 'letsgoplay_city_{key}'  (7-day TTL)
   - Merge shelters + playgrounds from all loaded files into appData

4. Render map once data is ready
```

**Note:** The old key `'letsgoplay_data'` and file `israel_data.json` are no longer used.

## build_cities.js

Node.js script that splits `archive/israel_data.json` into city/tile files.

```bash
node build_cities.js
```

- Reads `archive/israel_data.json`, writes to `data/`
- Creates 17 named city files + geographic tile files + `manifest.json`
- **ArcGIS protection:** City files with `"source":"arcgis"` at root level are **NOT overwritten** — they must be updated manually

## Replacing a City with Better ArcGIS Data

When a municipality publishes better data via ArcGIS REST API:

1. Fetch from the ArcGIS Feature Service endpoint(s)
2. Convert coordinates: Web Mercator (EPSG:3857) → WGS84 lat/lng
   - `lng = x / 20037508.34 * 180`
   - `lat = Math.atan(Math.exp(y / 20037508.34 * Math.PI)) * 360 / Math.PI - 90`
3. Write `./data/{city}.json` with `"source":"arcgis"` at the root level
4. Update the matching entry in `./data/manifest.json` with new shelter/playground counts
5. **Bump `manifest.json`'s root `generatedAt` to the current ISO timestamp** — this is required to invalidate browsers' localStorage city-file caches. Without this, users see stale data for up to 7 days.
6. Re-run is NOT needed — `build_cities.js` will skip ArcGIS-marked files

### Ra'anana ArcGIS endpoints (available, public, no auth required)
- **Parks/playgrounds** (76): `https://services5.arcgis.com/PtYt6sZAX61iaSv2/arcgis/rest/services/גנים_ופארקים_ציבוריים/FeatureServer/0/query?where=1=1&outFields=*&f=json&returnGeometry=true`
- **Public shelters** (22): `https://services5.arcgis.com/PtYt6sZAX61iaSv2/arcgis/rest/services/מקלטים_ציבוריים_ובמוסדות_חינוך_סמוכים_לגינות_ציבוריות/FeatureServer/1/query?where=1=1&outFields=*&f=json&returnGeometry=true`
- **Educational shelters** (21): `https://services5.arcgis.com/PtYt6sZAX61iaSv2/arcgis/rest/services/מקלטים_במוסדות_חינוך/FeatureServer/0/query?where=1=1&outFields=*&f=json&returnGeometry=true`

## Map

- Library: **Leaflet.js** loaded from CDN
- Marker clustering: **Leaflet.markercluster** from CDN — cluster **playgrounds only**, shelters always show individually at all zoom levels
- Tile layer: **CartoDB Positron** (clean, minimal, Apple-like)
- Default view: `lat: 31.5, lng: 35.0, zoom: 8` (center of Israel)
- On GPS grant: fly to user, zoom 15
- Floating pill button: `"📍 מצא מגרשים קרוב אליך"` — triggers GPS
- Map always visible before GPS — never blank

### Pins
| Type | Style |
|---|---|
| Playground | Green circle 🟢 |
| Shelter | Coral/red circle 🔴 |

### Popups
- **Playground tap**: name (fallback: `"מגרש משחקים"`), address (omit line if empty), distance from user, "מקלטים קרובים" list of 3 nearest shelters with distance in meters
- **Shelter tap**: address (fallback: city name), type label, ♿ if `accessible: true`

## Emergency mode
- Big red floating button bottom-center: `"🚨 חירום — מקלט עכשיו"`
- Tap → fullscreen red overlay showing:
  - Giant direction arrow character (↑ ↗ → ↘ ↓ ↙ ← ↖) toward nearest shelter
  - Distance in meters below arrow, e.g. `"230מ'"`
  - Shelter address below distance
- Arrow updates in real time via `watchPosition`
- "X" button exits emergency mode
- No GPS → show `"אפשר גישה למיקום כדי להשתמש במצב חירום"`

## UI / Design

- `dir="rtl"` `lang="he"` on `<html>`
- Language switcher top-right: `עב | EN | FR`
- Font: **Heebo** from Google Fonts
- Emergency button color: `#FF6B6B`
- Mobile-first — minimum 48px tap targets
- Top bar: logo `"🛝 LetsGoPlay"`
- Map skeleton visible immediately on load (tiles + UI chrome), spinner/placeholder overlay while data fetches, pins appear once data is ready

### CSS Design Tokens (from index.html)
```css
--green-action: #34C759;
--blue-ui: #007AFF;
--coral: #FF6B6B;
--bg-light: #F0F7FF;
--sh-sm / --sh-md / --sh-lg   /* shadow scales */
--radius-sm: 10px ... --radius-xl: 28px
```

## Internationalization

All UI strings in a top-level constant:
```js
const STRINGS = {
  he: { /* Hebrew strings */ },
  en: { /* English strings */ },
  fr: { /* French strings */ }
};
```
Default language: Hebrew. **All visible strings must go through `STRINGS[lang]` — no hardcoded text in markup.**

## Distance rules
- Always in **meters** only
- Switch to km (e.g. `"1.2ק"מ"`) only when ≥ 1000 m
- Never show minutes or driving time
- Direction as a bearing arrow character — not a Google Maps link

## Compatibility
Must work on mobile Chrome on iOS and Android.

## Hosting & Deployment

### Setup
- **Repo**: `https://github.com/elyxk/letsplaysafe`
- **Live URL**: `https://elyxk.github.io/letsplaysafe/`
- **Host**: GitHub Pages — auto-deploys from `main` branch, root (`/`)

### Push to production
Run these commands from `c:\Users\elysa\OneDrive\Documents\Ginavemiklat` in terminal (Git Bash or PowerShell with Git):

```bash
git add index.html
git commit -m "your message here"
git push
```

To also push data files (after running `node build_cities.js` or updating an ArcGIS city):
```bash
git add index.html data/
git commit -m "your message here"
git push
```

The site goes live ~30 seconds after push. No build step needed.

## Quality Gate — Required After Every Version

After completing any new version of the website, you **must** perform the following self-review loop before returning control to the user. Do not stop until all checks pass.

### Step 1 — Product Manager / UI-UX Review
Act as an award-winning product manager specializing in UI/UX. Review the full `index.html` for:
- **Performance**: unnecessary re-renders, blocking loads, large inline assets, CDN choices
- **Load time**: is the map skeleton visible immediately? Is the data fetch non-blocking? Is localStorage cache used properly?
- **Usability**: tap target sizes (≥ 48px), contrast ratios, font legibility, RTL layout correctness, popup readability
- **Mobile UX**: scroll behavior, viewport meta, touch events, no horizontal overflow
- **Accessibility**: ARIA labels on interactive elements, focus management in emergency overlay, keyboard nav
- **i18n completeness**: all visible strings go through `STRINGS[lang]`, no hardcoded Hebrew/English/French left in markup
- **Edge cases**: empty name/address fallbacks, no-GPS state, data fetch failure, localStorage quota error

For every issue found, fix it inline before moving to Step 2.

### Step 2 — End-to-End Self-Verification Checklist
Read the final `index.html` code and mentally simulate each scenario. Check every item:

- [ ] Page loads → map tiles appear immediately (no blank screen)
- [ ] Loading spinner shows while data fetches; disappears when done
- [ ] Playground markers appear clustered; shelters appear unclustered
- [ ] Clicking a playground popup shows name, address (or omits if empty), nearest 3 shelters with distances
- [ ] Clicking a shelter popup shows address/city fallback, type, ♿ if accessible
- [ ] "📍 מצא מגרשים קרוב אליך" button triggers geolocation; map flies to user at zoom 15
- [ ] Emergency button opens full-screen red overlay
- [ ] Emergency overlay shows correct bearing arrow + distance + address
- [ ] Emergency overlay "X" closes it cleanly
- [ ] No GPS → emergency overlay shows the no-location message
- [ ] Language switcher cycles through עב / EN / FR and all UI strings update
- [ ] Distance formatting: < 1000 m shows meters, ≥ 1000 m shows km with one decimal
- [ ] `dir="rtl"` and `lang="he"` on `<html>`
- [ ] Minimum 48px tap targets on all buttons
- [ ] No JavaScript errors thrown in any simulated scenario

If any check fails, fix it and re-run the checklist from the top.

Only after **all** checklist items pass may you return control to the user.

# currentDate
Today's date is 2026-03-12.
