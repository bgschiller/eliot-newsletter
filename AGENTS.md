# Eliot Newsletter — Layout Goals

## Print Edition (8.5×14" legal, 2 pages)

- **Nameplate** (SVG centered, date pinned right) spans full width on page 1 only. Footer on both pages.
- **Page 1, right column:** afternoon/evening schedule for the issue date (floats right at the top). Articles wrap around it in the left space.
- **Page 2, right column:** following day's schedule (floats right at the top). Remaining articles wrap around in the left space.
- Articles fill all available space — they wrap beside and below the schedule on each page, not restricted to rigid column boundaries.

## Web Edition

- **Two-column layout:** articles in the left column, both schedules stacked in the right column.
- Nameplate + date header at top.
- Mobile: schedules appear above articles (flex order), each as a bordered card.

## Content Model

- Each day's MDX has two schedule blocks: `<Schedule day="today">` (afternoon/evening) and `<Schedule day="tomorrow">` (following day).
- Article `##` sections follow the schedules.
- The page-1 / page-2 article split is computed at build time by `pnpm measure` and stored in frontmatter as `printPage1Articles`.
- Print font sizes are also computed by `pnpm measure` to fit content within page constraints.
