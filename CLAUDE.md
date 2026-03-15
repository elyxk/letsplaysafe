# גינה בטוחה — Project Instructions

## Overview
**גינה בטוחה** ("Safe Garden") — a single-file website that helps Israeli parents find playgrounds near bomb shelters.

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
See **Map Markers** in the Design System section above for exact colors and styles.

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

## UI / Design System

### Brand Identity
- **App name**: גינה בטוחה — always rendered two-tone: `<span style="color:#1BBCB3">גינה</span> <span style="color:#1C2D5E">בטוחה</span>`
- **Mascot**: teal bird reading a map (from logo). Used as emoji `🐦` in sidebar and page title.
- **Design language**: Duolingo ABC-inspired — playful, colorful, lots of white space, clean and minimal. Child-safe and friendly, never clinical or cold.
- **Font**: **Heebo** (Hebrew-optimized, Google Fonts) — weights 400/500/600/700/800. Heebo at 800 weight is naturally rounded and playful enough without needing a separate display font.

### Color Palette
All colors are defined as CSS custom properties in `:root`. **Never use hardcoded hex values in new CSS — always use tokens.**

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1BBCB3` | Primary actions, buttons, links, active states — the brand teal |
| `--green` | `#4ECBA0` | Playground markers, icons, route button |
| `--green-dark` | `#2A9A7A` | Playground hover/dark states |
| `--coral` | `#FF6B35` | Shelter markers, emergency elements, shelter icons |
| `--coral-dark` | `#E05520` | Shelter dark states |
| `--coral-light` | `#FFF4EE` | Shelter tinted backgrounds |
| `--orange` | `#F5A623` | Accent (review stars, location pin in logo) |
| `--sky` | `#EAF8F6` | Teal-tinted info backgrounds, borders, hover states |
| `--bg` | `#F7F9FB` | Page background — near-white, slightly warm |
| `--white` | `#ffffff` | Cards, surfaces |
| `--text` | `#1C2D5E` | Primary text — logo navy |
| `--text2` | `#7B8BAA` | Secondary/metadata text |
| `--text3` | `#BCC5D6` | Tertiary, disabled, placeholder |
| `--border` | `rgba(28,45,94,0.07)` | Dividers, card borders |

**Logo-extracted palette for reference (don't add new tokens without need):**
- Teal: `#1BBCB3` · Navy: `#1C2D5E` · Orange: `#F5A623` · Soft green: `#5CC85C`

### Typography
- Font family: `'Heebo', sans-serif` via `--font`
- Primary headings: `font-weight: 800`, `letter-spacing: -0.4px` to -0.5px
- Body: `font-weight: 500–600`
- Labels/metadata: `font-weight: 600–700`, `font-size: 11–13px`
- Always use `color: var(--text)` for primary text, `var(--text2)` for secondary

### Spacing & Shape
```css
--r-sm: 12px   /* inputs, tags, small cards */
--r-md: 16px   /* standard cards, buttons */
--r-lg: 22px   /* large containers */
--r-xl: 28px   /* bottom sheets, modals, pill buttons */
```
- Generous padding — never feel cramped
- White space is intentional — lean into it

### Shadows
```css
--sh-sm: 0 1px 4px rgba(28,45,94,0.06), 0 2px 8px rgba(28,45,94,0.05)
--sh-md: 0 2px 12px rgba(28,45,94,0.08), 0 6px 24px rgba(28,45,94,0.07)
--sh-lg: 0 4px 24px rgba(28,45,94,0.10), 0 12px 48px rgba(28,45,94,0.12)
```
Shadow tint is navy (`28,45,94`) not black — keeps them warm.

### Component Patterns
- **Buttons (primary)**: `background: var(--blue)`, white text, `border-radius: var(--r-md)` or `--r-xl`, `box-shadow: 0 4px 16px rgba(27,188,179,0.35)`, `min-height: 48px`
- **Buttons (secondary/ghost)**: transparent bg, `color: var(--blue)`, `border: 2px solid rgba(27,188,179,0.30)`, hover → `background: var(--sky)`
- **Active filter pills**: `background: var(--blue)`, white text, `box-shadow: 0 2px 8px rgba(27,188,179,0.30)`
- **Cards**: white background, `border-radius: var(--r-md)`, `box-shadow: var(--sh-sm)` or `var(--sh-md)`
- **Info/GPS cards**: `background: var(--sky)`, `border: 1px solid rgba(27,188,179,0.20)`
- **Dividers/borders**: always `var(--border)` or `2px solid var(--sky)`
- **Hover states on lists**: `background: var(--sky)` — never dark gray

### Map Markers
| Type | Style |
|---|---|
| Playground | Teal circle `#4ECBA0`, white SVG slide/swing icon, `box-shadow: 0 2px 10px rgba(78,203,160,.5)` |
| Shelter | Orange-red teardrop `#FF6B35`, white shield chevron inside, white stroke |
| Cluster (playgrounds) | Teal circle `#4ECBA0`, white count number |
| Cluster (shelters) | Orange-red circle `#FF6B35`, white count number |
| User location | Teal dot `var(--blue)`, pulsing teal ring |
| User→shelter line | `color: #FF6B35`, weight 3, opacity 0.9 |

### Emergency Mode
- Full-screen gradient: `linear-gradient(160deg, #FF4500 0%, #FF6B35 100%)`
- Strong and urgent — keep high contrast, large text
- "Show on Map" button: white background, `color: var(--coral)`
- Keep pulsing animation on emergency button: `emgPulse` keyframe with `rgba(255,107,53,...)` shadows

### Layout Rules
- `dir="rtl"` `lang="he"` on `<html>` at all times; flip to `ltr` only when English/French active
- Mobile-first — all default styles are mobile, desktop overrides at `768px`
- **Minimum 48px tap targets** on all interactive elements
- Topbar: clean white `background: white`, teal bottom border `border-bottom: 2px solid var(--sky)`
- Sidebar (desktop): `background: white`, teal left border `border-left: 2px solid var(--sky)`
- Map skeleton always visible — never a blank screen before data loads

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
