# AGENTS.md

## Project
- Name: `TabTree`
- Type: Chrome extension (Manifest V3)
- Goal: tree-style vertical tabs in side panel with theme sync, customization, keyboard shortcuts, multi-select, and batch operations.

## Stack
- Runtime: plain JavaScript (ES modules), no build step
- UI: `sidepanel/index.html`, `sidepanel/app.js`, `sidepanel/styles.css`
- Background: `background/service_worker.js`
- Shared logic/constants: `shared/*.js`
- Tests: Node test runner (`tests/treeModel.test.js`), optional Playwright e2e (`tests/e2e/*`)

## Key Files
- `manifest.json`: permissions, commands, side panel entry, service worker
- `background/service_worker.js`: tab event reconciliation + tree actions + storage sync/local
- `sidepanel/app.js`: UI state/render/events, theme presets, selection, batch actions, confirm modal
- `sidepanel/styles.css`: visual system and component states
- `shared/constants.js`: storage keys, defaults, message and action contracts
- `shared/treeModel.js`: tree model/reducer helpers
- `shared/treeStore.js`: storage adapters and debounce persistence

## Development Workflow
1. Load unpacked extension in `chrome://extensions`.
2. Reload extension after editing `manifest.json` or service worker logic.
3. For side panel UI-only changes, reload the extension and reopen side panel.

## Commands
- Unit tests: `npm test`
- E2E (after install): `npm run test:e2e`
- E2E headed: `npm run test:e2e:headed`

## Product/Behavior Guardrails
- `Cmd+T` should create a normal top-level tab (not auto-child).
- Add-child command (`Control+Command+A` on macOS) should create a child under active tab.
- Pinned tabs render as one horizontal, scrollable icon row.
- Grouped tabs render as color-coded group subtrees with group name.
- Search row doubles as top-level drop target during drag.
- Multi-select supports shift-click ranges and batch operations.
- Closing subtree/batch closes should confirm only when affecting 2+ tabs unless user disabled confirmation.

## Theme System
- Presets: Catppuccin (Latte/Frappe/Macchiato/Mocha), Everforest (Light/Dark), Gruvbox (Light/Dark)
- Preset applies full token palette; user controls remain editable overrides.
- Keep token updates centralized in `applyThemeFromSettings()`.

## Storage / Sync
- Settings in `chrome.storage.sync`.
- Per-window heavy tree state in `chrome.storage.local`.
- Lightweight metadata snapshot in sync.
- Backward compatibility: new settings keys must have defaults in `shared/constants.js`.

## Change Discipline
- Keep tree mutations in background worker authoritative.
- Side panel should send actions and render state, not own canonical tree.
- For new actions, update both:
  - `shared/constants.js` action enum
  - `background/service_worker.js` `handleTreeAction` and handlers
- Add/adjust unit tests for tree-model behavior regressions.

## Manual QA Checklist
- Shortcut add-child creates child under active tab.
- Shift-click and batch bar operations work as expected.
- Confirm dialog `Cancel` only dismisses; `Close` executes action.
- Theme preset switch + overrides persist across reload.
- Drag/drop: inside/before/after and root-drop behave correctly.
- Pinned row alignment and active state remain visually centered.
