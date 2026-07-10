# print-preview

A dev tool for live print layout iteration. One command, zero UI: edit articles in your editor, save, and the print PDF regenerates automatically and appears in Preview.app.

## Goal

Tighten the feedback loop when adjusting article ordering for the two-column print edition. Currently: run dev server → Cmd+P → inspect → switch to editor → reorder articles → repeat. With `print-preview`, every save produces an updated PDF that Preview.app auto-refreshes.

## Usage

```bash
pnpm print-preview           # latest non-draft day
pnpm print-preview 2026-07-16  # specific day
```

Preview.app opens the PDF and live-reloads when the file changes.

## Architecture

```
┌─────────────┐    file change    ┌──────────────┐
│  Your editor │ ───────────────→ │  astro dev   │
│  (VS Code)   │                  │  (spawned)   │
└─────────────┘                  │              │
                                 │ Vite plugin: │
                                 │ touches      │
                                 │ marker file  │
                                 │ on mdx build │
                                 └──────┬───────┘
                                        │
                                   watches
                                        │
                                 ┌──────▼───────┐
                                 │ print-preview│
                                 │ script       │
                                 │              │
                                 │ Playwright   │
                                 │ → PDF        │
                                 └──────┬───────┘
                                        │
                                   open(1)
                                        │
                                 ┌──────▼───────┐
                                 │ Preview.app  │
                                 │ (auto-reload)│
                                 └──────────────┘
```

### Components

1. **`scripts/print-preview.ts`** — the main script
   - Spawns `astro dev` as a child process (with `PRINT_PREVIEW=1` env var)
   - Auto-detects the day to preview (arg or latest non-draft)
   - Watches `.pi/print-rebuild-trigger` for changes (debounced ~500ms)
   - On trigger: opens Playwright headless Chromium, navigates to `localhost:4321/<date>/`, calls `page.pdf()`, writes to `.pi/<date>.pdf`
   - Opens the PDF in Preview.app via `open -a Preview`

2. **Vite plugin** (in `astro.config.mjs`, conditionally loaded)
   - When `PRINT_PREVIEW=1`, registers a `handleHotUpdate` hook
   - On `.mdx` file changes: touches `.pi/print-rebuild-trigger`
   - Ensures the marker write happens after Astro finishes rebuilding

3. **`package.json`** — adds `"print-preview": "tsx scripts/print-preview.ts"` script

### PDF generation

Uses Playwright's `page.pdf()` which respects `@media print` CSS, including:
- `size: 8.5in 14in` (legal paper)
- `break-before: page` on the second `.column-row`
- Print font sizes from frontmatter (via CSS variables)

### File paths

| Path | Purpose |
|---|---|
| `.pi/print-rebuild-trigger` | Marker file touched by Vite plugin |
| `.pi/<date>.pdf` | Generated PDF, opened in Preview.app |

## Design decisions

- **No UI in the tool itself.** Editing happens in your editor (VS Code, etc.). The tool's job is purely regeneration.
- **Preview.app for PDF display.** macOS Preview.app auto-reloads when the underlying file changes, giving instant feedback.
- **Vite plugin for rebuild detection.** Rather than polling or file-watching with debounce guesses, the Vite plugin touches a marker file after every completed `.mdx` rebuild. This guarantees the PDF is generated from the latest build.
- **`astro dev` spawned internally.** One command to run, not two terminals.
- **Article reordering is manual.** Editors move `##` article blocks between `<ColumnRow>` wrappers in the MDX source. The tool doesn't manipulate source files.
