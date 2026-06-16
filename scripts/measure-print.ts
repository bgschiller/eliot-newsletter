/**
 * Build-time print size measurement using @chenglou/pretext + node-canvas.
 *
 * Reads all MDX day files, measures schedule & article heights at print
 * geometry, computes optimal font sizes, and writes them into each file's
 * frontmatter so the Astro page can bake them into the print CSS.
 *
 * Run: pnpm measure
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';
import { prepare, layout } from '@chenglou/pretext';

// Patch global canvas for pretext (it expects a browser Canvas)
(globalThis as any).document = { createElement: () => createCanvas(1, 1) };

// ── Print geometry (points) ─────────────────────────────────────
const LETTER_W = 612; // US Legal width
const LETTER_H = 1008; // US Legal height (14in)
const MARGIN = 0.55 * 72;
const PAGE_W = LETTER_W - 2 * MARGIN;
const PAGE_H = LETTER_H - 2 * MARGIN;
const SCHEDULE_FRAC = 0.45;
const COL_GAP_FRAC = 0.05;
const SCHEDULE_W = PAGE_W * SCHEDULE_FRAC;
const ARTICLE_W_P2 = (PAGE_W * (1 - COL_GAP_FRAC)) / 2;
const SCHEDULE_LH_RATIO = 1.15;
const BODY_LH_RATIO = 1.2;
const SCHEDULE_GAP = 1.5;

const TARGET_SCHEDULE = 10;
const TARGET_BODY = 11;
const TARGET_HEADING = 16;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAYS_DIR = join(__dirname, '..', 'src', 'days');

// ── Helpers ──────────────────────────────────────────────────────

function font(sizePt: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${sizePt}pt Georgia`;
}

function measureLines(lines: string[], sizePt: number, colW: number, lhRatio: number): number {
  let total = 0;
  const f = font(sizePt);
  const lh = sizePt * lhRatio;
  for (const text of lines) {
    const p = prepare(text, f);
    const { height } = layout(p, colW, lh);
    total += height > 0 ? height : lh;
  }
  return total;
}

// ── MDX parsing ──────────────────────────────────────────────────

interface TimeslotBlock {
  events: string[];
}

interface Article {
  heading: string;
  paragraphs: string[];
}

function parseMdx(raw: string): { schedule: TimeslotBlock[]; articles: Article[] } {
  const schedule: TimeslotBlock[] = [];
  const articles: Article[] = [];

  // Extract schedule: between <Schedule> and </Schedule>
  const schedMatch = raw.match(/<Schedule>([\s\S]*?)<\/Schedule>/);
  if (schedMatch) {
    const schedRaw = schedMatch[1];
    // Find each <Timeslot ...>...</Timeslot>
    const slotRegex = /<Timeslot[^>]*>([\s\S]*?)<\/Timeslot>/g;
    let slotMatch;
    while ((slotMatch = slotRegex.exec(schedRaw)) !== null) {
      const inner = slotMatch[1];
      const events: string[] = [];
      const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
      let liMatch;
      while ((liMatch = liRegex.exec(inner)) !== null) {
        // Strip HTML tags from event text
        let text = liMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) events.push(text);
      }
      if (events.length > 0) schedule.push({ events });
    }
  }

  // Extract articles: everything after </Schedule>
  const afterSched = raw.split('</Schedule>')[1];
  if (afterSched) {
    // Split by ## headings
    const sections = afterSched.split(/^##\s+/m).filter(Boolean);
    for (const section of sections) {
      const lines = section.split('\n');
      const heading = lines[0].trim();
      const paragraphs: string[] = [];

      let collecting = false;
      let buf = '';
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') {
          if (buf) { paragraphs.push(buf); buf = ''; }
          collecting = false;
        } else if (line.startsWith('<AuthorCredit')) {
          if (buf) { paragraphs.push(buf); buf = ''; }
          // Skip author credits in measurement (they're small)
          collecting = false;
        } else {
          if (collecting) buf += ' ' + line;
          else { buf = line; collecting = true; }
        }
      }
      if (buf) paragraphs.push(buf);

      if (heading) articles.push({ heading, paragraphs });
    }
  }

  return { schedule, articles };
}

// ── Measurement ──────────────────────────────────────────────────

function measureSchedule(blocks: TimeslotBlock[]): number {
  let total = 0;
  for (let i = 0; i < blocks.length; i++) {
    total += measureLines(blocks[i].events, TARGET_SCHEDULE, SCHEDULE_W, SCHEDULE_LH_RATIO);
    if (i < blocks.length - 1) total += SCHEDULE_GAP;
  }
  return total;
}

function measureArticleHeight(art: Article, bodySize: number, headingSize: number): number {
  let h = 0;
  const hp = prepare(art.heading, font(headingSize, true));
  h += layout(hp, ARTICLE_W_P2, headingSize * BODY_LH_RATIO).height || headingSize * BODY_LH_RATIO;
  for (const para of art.paragraphs) {
    const pp = prepare(para, font(bodySize));
    h += layout(pp, ARTICLE_W_P2, bodySize * BODY_LH_RATIO).height || bodySize * BODY_LH_RATIO;
  }
  return h;
}

function measureArticles(articles: Article[], bodySize: number, headingSize: number): number {
  let total = 0;
  for (const art of articles) {
    total += measureArticleHeight(art, bodySize, headingSize);
  }
  return total;
}

/**
 * Find how many articles fit in 2 page-heights of columns (page 1).
 * The rest overflow to page 2 (1 column next to schedule).
 */
function findPage1Split(
  articles: Article[],
  bodySize: number,
  headingSize: number,
): number {
  let cumulative = 0;
  const limit = 2 * PAGE_H;
  for (let i = 0; i < articles.length; i++) {
    cumulative += measureArticleHeight(articles[i], bodySize, headingSize);
    if (cumulative > limit) {
      return i; // articles 0..i-1 fit on page 1
    }
  }
  return articles.length; // all fit on page 1
}

function computeSizes(
  schedule: TimeslotBlock[],
  articles: Article[],
): { scheduleSize: number; bodySize: number; headingSize: number; page1Articles: number } {
  // Schedule: check if it fits at target size
  let scheduleSize = TARGET_SCHEDULE;
  const schedH = measureSchedule(schedule);
  if (schedH > PAGE_H) {
    // Binary search for largest size that fits
    let lo = 7, hi = TARGET_SCHEDULE;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      let h = 0;
      for (let j = 0; j < schedule.length; j++) {
        h += measureLines(schedule[j].events, mid, SCHEDULE_W, SCHEDULE_LH_RATIO);
        if (j < schedule.length - 1) h += Math.max(1, SCHEDULE_GAP * (mid / TARGET_SCHEDULE));
      }
      if (h <= PAGE_H) lo = mid; else hi = mid;
    }
    scheduleSize = Math.round(lo * 10) / 10;
  }

  // Articles: check at target sizes
  const totalColSpace = 3 * PAGE_H;
  let bodySize = TARGET_BODY;
  let headingSize = TARGET_HEADING;

  const h = measureArticles(articles, TARGET_BODY, TARGET_HEADING);
  if (h > totalColSpace) {
    // Find largest body size that fits, keeping heading ~1.45× body
    let bestBody = 7;
    for (let tryBody = 1; tryBody <= TARGET_BODY; tryBody += 0.25) {
      const tryH = tryBody * 1.45;
      const th = measureArticles(articles, tryBody, tryH);
      if (th <= totalColSpace) bestBody = tryBody;
      else break;
    }
    bodySize = Math.round(bestBody * 100) / 100;
    headingSize = Math.round(bestBody * 1.45 * 10) / 10;
  }

  const page1Articles = findPage1Split(articles, bodySize, headingSize);

  return { scheduleSize, bodySize, headingSize, page1Articles };
}

// ── Frontmatter update ───────────────────────────────────────────

function updateFrontmatter(
  filePath: string,
  raw: string,
  sizes: { scheduleSize: number; bodySize: number; headingSize: number; page1Articles: number },
): string {
  // The frontmatter is between --- fences
  const parts = raw.split('---');
  if (parts.length < 3) return raw; // no frontmatter

  let fm = parts[1];
  // Remove any existing print size lines
  fm = fm.replace(/^printScheduleSize:.*\n?/gm, '');
  fm = fm.replace(/^printBodySize:.*\n?/gm, '');
  fm = fm.replace(/^printHeadingSize:.*\n?/gm, '');
  fm = fm.replace(/^printPage1Articles:.*\n?/gm, '');
  // Trim trailing whitespace
  fm = fm.trimEnd();

  // Append new sizes
  fm += `\nprintScheduleSize: ${sizes.scheduleSize}`;
  fm += `\nprintBodySize: ${sizes.bodySize}`;
  fm += `\nprintHeadingSize: ${sizes.headingSize}`;
  fm += `\nprintPage1Articles: ${sizes.page1Articles}`;

  return `---${fm}\n---${parts.slice(2).join('---')}`;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const files = (await readdir(DAYS_DIR)).filter((f) => f.endsWith('.mdx'));

  for (const file of files) {
    const filePath = join(DAYS_DIR, file);
    const raw = readFileSync(filePath, 'utf-8');
    const { schedule, articles } = parseMdx(raw);

    if (schedule.length === 0 && articles.length === 0) {
      console.log(`⚠ ${file}: no content found, skipping`);
      continue;
    }

    const sizes = computeSizes(schedule, articles);

    const updated = updateFrontmatter(filePath, raw, sizes);
    writeFileSync(filePath, updated, 'utf-8');

    console.log(`📐 ${file}:`);
    console.log(`   Schedule: ${sizes.scheduleSize}pt (${schedule.length} blocks, ${schedule.reduce((s, b) => s + b.events.length, 0)} events)`);
    console.log(`   Body:     ${sizes.bodySize}pt (${articles.length} articles, ${articles.reduce((s, a) => s + a.paragraphs.length, 0)} paragraphs)`);
    console.log(`   Heading:  ${sizes.headingSize}pt`);
    console.log(`   Split:    first ${sizes.page1Articles} articles → page 1, rest → page 2`);
  }
}

main().catch(console.error);
