# TabTree (Chrome Extension)

Tree-style vertical tabs in Chrome's side panel with sync-backed appearance/settings and keyboard commands.

## Implemented

- MV3 extension with side panel UI (`manifest_version: 3`)
- Tree tab model with parent/child relationships
- Drag-and-drop reparenting
- Shift-click multi-select with batch operations
- Search/filter by title or URL
- Search row doubles as drag-to-root drop target
- Pinned icon-only rows
- Tab group subtrees with group name and color
- Parent-close behavior: promotes children
- Commands including add-child tab (user-configurable)
- Appearance always follows browser/OS light-dark preference
- Preset themes: Catppuccin (4), Everforest (2), Gruvbox (2), Tokyo Night (2), Kanagawa (2), One (2)
- Separate Light and Dark appearance presets with shared accent color
- Appearance customization (multiple density presets, font scale, indent, radius)
- Close-tree confirmation dialog (2+ tabs) with sync-persisted skip option
- Settings persisted to `chrome.storage.sync`
- Window tree state persisted to `chrome.storage.local`
- Lightweight metadata snapshot persisted to `chrome.storage.sync`

## Project Layout

- `manifest.json`
- `background/service_worker.js`
- `sidepanel/index.html`
- `sidepanel/app.js`
- `sidepanel/styles.css`
- `shared/constants.js`
- `shared/treeModel.js`
- `shared/treeStore.js`
- `tests/treeModel.test.js`

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder
4. Pin the extension and click it once to open side panel behavior

## Shortcuts

Open `chrome://extensions/shortcuts` to customize commands.

## Test

```bash
npm test
```

## Notes

- Restore is best-effort based on URL/opener relationships and stored metadata.
- Cross-device behavior is metadata sync only; tabs are not auto-opened remotely.

## E2E (Playwright)

### Install dependencies

```bash
npm install
npx playwright install chromium
```

### Run

```bash
npm run test:e2e
```

For headed mode:

```bash
npm run test:e2e:headed
```

### E2E coverage

- Extension bootstraps and renders side panel shell
- Settings panel interaction and sync persistence check
- Global "Add Child" action opens a new tab
