# Eliot Newsletter — Layout & Tooling

## Layout Model

Both web and print use **CSS Multi-Column** (`column-count: 2`) inside `<ColumnRow>` wrappers. Each ColumnRow represents one visual "row" of two columns — roughly one printed page.

- **Schedule** uses `break-before: column` to land in the right column regardless of source order.
- **Articles** (`##` sections) flow into both columns: column 1 beside the schedule, then column 2 below it.
- **Print** uses the same two-column flow (no float hacks). The second ColumnRow gets a `break-before: page`.
- **Mobile** collapses to single column.

```
┌─────────────┬────────────┐
│  Article 1  │  Schedule  │
│  Article 2  │  (today)   │
│             │            │
│  Article 3  │  Article 5 │
│  Article 4  │  Article 6 │
├─────────────┼────────────┤
│             │  Schedule  │
│  Article 7  │  (tomorrow)│
│  Article 8  │            │
│             │  Article   │
│  Article 9  │  10        │
└─────────────┴────────────┘
```

## Content Model

Each day's MDX has a `<ColumnRow>` for each page. Schedule comes first, then articles:

```mdx
---
date: July 16, 2026
draft: true
printScheduleSize: 10
printBodySize: 11
printHeadingSize: 16
printPage1Articles: 2
---

<ColumnRow>
<Schedule day="today">
  <h2>Thursday, July 16</h2>
  <Timeslot start="6:00" bold>...</Timeslot>
  ...
</Schedule>

## Article 1
...

## Article 2
...
</ColumnRow>

<ColumnRow>
<Schedule day="tomorrow">
  <h2>Friday, July 17</h2>
  ...
</Schedule>

## Article 3
...
</ColumnRow>
```

- **Schedule blocks:** `<Schedule day="today">` (afternoon/evening) and `<Schedule day="tomorrow">` (following day). Each contains `<Timeslot>` children with `<li>` events.
- **Article order within each ColumnRow is manual.** Move articles between ColumnRows to balance the print layout visually.
- **`printPage1Articles`** is computed by `pnpm measure` as a measurement hint. It's informative only — the actual split is determined by the `<ColumnRow>` boundaries you place.

## Build Tools

### `pnpm measure`

Runs `scripts/measure-print.ts`. For each MDX file:
- Measures schedule/article heights using `@chenglou/pretext` + `node-canvas`
- Computes optimal font sizes for print (`printScheduleSize`, `printBodySize`, `printHeadingSize`)
- Computes `printPage1Articles` as a hint
- Writes these values to frontmatter

Does **not** modify the MDX body. ColumnRow boundaries are your responsibility.

### `pnpm print-preview`

Runs `scripts/print-preview.ts`. Live print layout iteration:
- Spawns `astro dev` (internally, one command)
- Watches for MDX rebuilds via a Vite plugin marker file
- Regenerates a legal-size PDF via Playwright on each change
- Opens the PDF in Preview.app (auto-refreshes on file change)

```bash
pnpm print-preview              # latest non-draft day
pnpm print-preview 2026-07-16   # specific day
```

**DRAFT watermark:** Every page shows a large "DRAFT" watermark when running in dev mode or when the day is explicitly marked `draft: true` in frontmatter. Draft days are only routable in dev mode.

### `pnpm build` / `pnpm dev`

Standard Astro commands. The Vite plugin in `astro.config.mjs` (conditionally loaded when `PRINT_PREVIEW=1`) touches `.pi/print-rebuild-trigger` on each MDX rebuild — used by `print-preview`.

## Key Files

| Path | Purpose |
|---|---|
| `src/days/*.mdx` | Content: one file per issue day |
| `src/components/ColumnRow.astro` | `<div class="column-row">` wrapper |
| `src/components/Schedule.astro` | `<div class="schedule schedule--{day}">` |
| `src/components/Timeslot.astro` | Time-labeled event group |
| `src/components/AuthorCredit.astro` | `—Name` credit line |
| `src/pages/index.astro` | Home page (latest non-draft) |
| `src/pages/[date].astro` | Per-day page |
| `src/content.config.ts` | Content collection schema |
| `scripts/measure-print.ts` | Font size + article split measurement |
| `scripts/print-preview.ts` | Live PDF preview tool |
| `public/styles/global.css` | All styles (screen + print + mobile) |
| `astro.config.mjs` | Astro config + print-preview Vite plugin |
| `docs/print-preview.md` | print-preview tool spec |
