# Phase 1 & Phase 2 — 100% Completion Plan

## Background

The storage layer, schema, validation, migrations, and backup are all complete and well-structured. The remaining work is split into two tracks:

- **Phase 1 gaps** — tooling/config items and the critical background service worker
- **Phase 2** — core UX surfaces: popup, dashboard, and options page

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Dashboard charting library**: The dashboard requires time-series and breakdown charts. Do you want to use a library like **Chart.js** (lightweight, ~60KB) or vanilla canvas/SVG only?
> Default plan: use **Chart.js** via npm.

> [!IMPORTANT]
> **Q2 — Dashboard access**: Should the dashboard open as a **standalone full browser tab** (via `chrome.tabs.create`) triggered from the popup, or as a separate page the user can bookmark?
> Default plan: popup has an "Open Dashboard" button that calls `chrome.tabs.create`.

> [!IMPORTANT]
> **Q3 — Idle detection**: The plan specifies an `idleThreshold` of 60 seconds. Should idle time be completely **excluded** from the domain's tracked time, or tracked separately as "idle" time?
> Default plan: idle time is excluded (time pauses when user goes idle).

---

## Proposed Changes

---

### Phase 1 Part 1 Gap — Tooling

#### [MODIFY] [package.json](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/package.json)

- Fix `build` script: `"build": "vite"` → `"build": "vite build"`
- Add `"lint": "eslint src/"` script
- Add `"test:chrome": "chrome --user-data-dir=%USERPROFILE%\\chrome-test-profile --no-first-run"` script (Windows-compatible)
- Add ESLint + Prettier to `devDependencies`:
  - `eslint`, `@eslint/js`, `eslint-config-prettier`, `prettier`

#### [NEW] [.eslintrc.cjs](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/.eslintrc.cjs)

Configure for browser + ES modules environment:

```js
module.exports = {
  env: { browser: true, es2022: true, webextensions: true },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-unused-vars': 'warn', 'no-console': 'off' },
};
```

#### [NEW] [.prettierrc](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/.prettierrc)

```json
{ "singleQuote": true, "semi": true, "trailingComma": "es5" }
```

---

### Phase 1 Part 2 Gap — Background Service Worker

This is the **most critical missing piece** — without it, nothing gets tracked.

#### [MODIFY] [src/background.js](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/background.js)

Full implementation in a single service worker file. Key responsibilities:

**Tab tracking state machine:**

- `activeTabId` — currently focused tab
- `activeDomain` — hostname of active tab
- `sessionStart` — timestamp when tracking began for current domain
- Transitions: `tabs.onActivated` → `tabs.onUpdated` → `windows.onFocusChanged` → `idle.onStateChanged`

**Functions to implement:**

| Function                 | Purpose                                                                           |
| ------------------------ | --------------------------------------------------------------------------------- |
| `startTracking(domain)`  | Set `activeDomain`, `sessionStart = Date.now()`                                   |
| `stopTracking()`         | Compute elapsed seconds, call `addTimeToDomain()` and `addSession()`, clear state |
| `getActiveDomain(tabId)` | Get hostname from `chrome.tabs.get(tabId)`, return null for `chrome://` pages     |
| `handleTabChange(tabId)` | Call `stopTracking()` then `startTracking(newDomain)`                             |

**Event listeners to wire:**

```
chrome.tabs.onActivated       → handleTabChange
chrome.tabs.onUpdated         → if url changed in active tab, handleTabChange
chrome.windows.onFocusChanged → if focus lost (id === -1), stopTracking; else handleTabChange
chrome.idle.onStateChanged    → if idle/locked, stopTracking; if active, startTracking
chrome.alarms.onAlarm         → periodic flush every 30s (safe-guard against SW termination)
chrome.runtime.onStartup      → init + pruneOldData
chrome.runtime.onInstalled    → init + set alarm
```

**Alarm for periodic flush:**

- `chrome.alarms.create('periodic-flush', { periodInMinutes: 0.5 })` — every 30 seconds, commit current elapsed time to storage without resetting `sessionStart`

**SW keepalive consideration:**

- MV3 service workers can terminate after ~30s of inactivity. The periodic alarm keeps it alive. All state should be re-derivable from chrome.tabs if SW wakes cold.

---

### Phase 2 Part 1 - Popup

#### [MODIFY] [src/popup/popup.html](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/popup/popup.html)

Full redesign with dark-mode UI:

- **Header**: Extension name + settings gear icon
- **Today at a glance**: Total time tracked today (formatted `Xh Xm`)
- **Current site**: Domain being tracked right now + live elapsed time
- **Top 5 sites today**: Mini list with domain favicon + time bar
- **Footer buttons**: "Open Dashboard" and "Options"

#### [MODIFY] [src/popup/popup.js](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/popup/popup.js)

- On load: `getData()` → render today's stats
- Live timer: `setInterval` to update current-site elapsed time every second
- "Open Dashboard" button: `chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') })`
- "Options" button: `chrome.runtime.openOptionsPage()`

---

### Phase 2 Part 2 - Dashboard

#### [MODIFY] [src/dashboard/dashboard.html](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/dashboard/dashboard.html)

Full-page analytics dashboard with:

- **Date range picker**: Today / Last 7 days / Last 30 days / Custom
- **Summary cards**: Total time, most visited site, active days, longest session
- **Daily breakdown chart** (Chart.js bar chart): X = days, Y = total minutes
- **Top domains pie/doughnut chart**: Top 10 domains by time
- **Domain table**: Sortable list with domain, total time, sessions, first seen
- **Export button**: triggers `exportData()`
- **Import button**: file input + `importData()`

#### [MODIFY] [src/dashboard/dashboard.js](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/dashboard/dashboard.js)

- Date range state + filter function over `data.days`
- Aggregate data → Chart.js datasets
- Render summary cards from computed totals
- Render sortable domain table
- Wire import/export buttons to storage functions

#### [NEW] [src/dashboard/dashboard.css](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/dashboard/dashboard.css)

Standalone CSS for the dashboard page (dark theme, grid layout, card components).

---

### Phase 2 Part 3 - Options Page

#### [MODIFY] [src/options/options.html](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/options/options.html)

Sections:

- **Idle threshold**: Number input (seconds) — maps to `settings.idleThreshold`
- **Categories**: Add/edit/delete named domain groups (e.g., "Social" = `twitter.com, reddit.com`)
- **Data management**: Export, Import, Clear all data, Prune old data
- **About**: Version, storage usage meter

#### [MODIFY] [src/options/options.js](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/options/options.js)

- Load settings via `getSettings()` → populate form fields
- Save button → `updateSettings()`
- Category CRUD → manipulate `settings.categories` object
- Export/Import/Clear wired to storage functions
- Storage usage: `chrome.storage.local.getBytesInUse()` → render as progress bar

---

### Phase 3 Gap — Quota Analysis Doc

#### [NEW] [src/lib/quota-analysis.md](file:///c:/Users/Administrator/Documents/Web%20Dev%20Projects/STAL/src/lib/quota-analysis.md)

Document the storage math:

- Per-day record size estimate (avg domains \* 8 bytes)
- Per-session record size estimate
- 90-day projection vs 10 MB limit
- Pruning trigger threshold recommendation

---

## Verification Plan

### Automated / Script Tests

- `npm run build` — must exit 0 with no errors
- `npm run lint` — must produce 0 errors (warnings allowed)
- Manual console test in popup devtools: `await chrome.storage.local.get('screenTimeData')` returns valid structure

### Manual Verification Checklist

- [ ] Extension loads in `chrome://extensions` with no red errors
- [ ] Browse to a site for 10 seconds → open popup → verify time appears
- [ ] Switch tabs → verify old domain time stopped, new domain starts
- [ ] Lock screen or go idle for 60s → verify tracking paused
- [ ] Reload extension → reopen popup → verify data persisted
- [ ] Open dashboard → verify charts render with real data
- [ ] Export JSON → verify file downloads, open it, confirm valid structure
- [ ] Import same JSON → verify data restored
- [ ] Options page → change idle threshold → verify saved across reload
- [ ] Add a category → assign domains → verify in storage

---

## Execution Order

```
1. Tooling fixes (package.json, .eslintrc.cjs, .prettierrc)          ~30 min
2. Background service worker (background.js)                          ~2–3 hrs
3. utils.js — add formatSeconds, getDomain, getTodayStr helpers       ~20 min
4. Popup (popup.html + popup.js)                                      ~1 hr
5. Dashboard (dashboard.html + dashboard.js + dashboard.css)          ~2–3 hrs
6. Options page (options.html + options.js)                           ~1 hr
7. Quota analysis doc                                                 ~15 min
8. Build + lint verification                                          ~15 min
```

**Estimated total: ~8–10 hours of focused work.**
