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

Each day's MDX imports schedules from separate files and contains articles in `<ColumnRow>` wrappers:

```mdx
---
date: July 16, 2026
draft: true
printScheduleSize: 10
printBodySize: 11
printHeadingSize: 16
---
import AfternoonSchedule from "../schedules/2026-07-16-afternoon.mdx"
import MorningSchedule from "../schedules/2026-07-17-morning.mdx"

<ColumnRow>
  <Article title="Article 1">...</Article>
  <AfternoonSchedule />
  <Article title="Article 2">...</Article>
</ColumnRow>

<ColumnRow>
  <MorningSchedule />
  <Article title="Article 3">...</Article>
</ColumnRow>
```

- **Schedule files** live in `src/schedules/`, named by date: `{date}-afternoon.mdx` (today's schedule) and `{next-date}-morning.mdx` (tomorrow's schedule). Each contains a single `<Schedule>` block with `<Timeslot>` children.
- **Articles** use `<Article>` components. Article order within each ColumnRow is manual — move them to balance the print layout visually.
- **Print font sizes** (`printScheduleSize`, `printBodySize`, `printHeadingSize`) are set manually in frontmatter per day.

## Build Tools

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
| `scripts/print-preview.ts` | Live PDF preview tool |
| `public/styles/global.css` | All styles (screen + print + mobile) |
| `astro.config.mjs` | Astro config + print-preview Vite plugin |
| `docs/print-preview.md` | print-preview tool spec |
