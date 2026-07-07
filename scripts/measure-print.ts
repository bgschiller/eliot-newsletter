/**
 * Build-time print size measurement using @chenglou/pretext + node-canvas.
 *
 * Layout model:
 *   Page 1: nameplate → schedule-today (float right, 45%w) + articles-front (wrap)
 *   Page 2: schedule-tomorrow (float right, 45%w) + articles-back (wrap)
 *
 * Each schedule must fit in one page height. Articles are measured at
 * the narrow column width (remaining space left of schedule) for a
 * conservative fit estimate.
 *
 * Run: pnpm measure
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from 'canvas';
import { prepare, layout } from '@chenglou/pretext';

(globalThis as any).document = { createElement: () => createCanvas(1, 1) };

// ── Print geometry (points) ─────────────────────────────────────
const LETTER_W = 612;
const LETTER_H = 1008;
const MARGIN = 0.55 * 72;
const PAGE_W = LETTER_W - 2 * MARGIN;
const PAGE_H = LETTER_H - 2 * MARGIN;
const SCHEDULE_FRAC = 0.45;
const COL_GAP_FRAC = 0.05;
const SCHEDULE_W = PAGE_W * SCHEDULE_FRAC;
const ARTICLE_W = PAGE_W * (1 - SCHEDULE_FRAC - COL_GAP_FRAC);
const LINE_H_RATIO = 1.2;

const TARGET_SCHEDULE = 10;
const TARGET_BODY = 11;
const TARGET_HEADING = 16;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DAYS_DIR = join(__dirname, '..', 'src', 'days');

// ── Helpers ──────────────────────────────────────────────────────

function font(sizePt: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${sizePt}pt Georgia`;
}

function measureHeight(text: string, sizePt: number, colW: number): number {
  const p = prepare(text, font(sizePt));
  const result = layout(p, colW, sizePt * LINE_H_RATIO);
  return result.height > 0 ? result.height : sizePt * LINE_H_RATIO;
}

// ── MDX parsing ──────────────────────────────────────────────────

interface TimeslotBlock { events: string[] }
interface Article { heading: string; paragraphs: string[] }

function extractTimeslots(raw: string): TimeslotBlock[] {
  const blocks: TimeslotBlock[] = [];
  const slotRegex = /<Timeslot[^>]*>([\s\S]*?)<\/Timeslot>/g;
  let m;
  while ((m = slotRegex.exec(raw)) !== null) {
    const events: string[] = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let lm;
    while ((lm = liRegex.exec(m[1])) !== null) {
      const text = lm[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) events.push(text);
    }
    if (events.length > 0) blocks.push({ events });
  }
  return blocks;
}

function extractArticles(raw: string): Article[] {
  const articles: Article[] = [];
  // Find last </Schedule> and take everything after it
  const lastClose = raw.lastIndexOf('</Schedule>');
  if (lastClose === -1) return articles;
  const after = raw.slice(lastClose + '</Schedule>'.length);
  const sections = after.split(/^##\s+/m).filter(Boolean);
  for (const section of sections) {
    const lines = section.split('\n');
    const heading = lines[0].trim();
    const paragraphs: string[] = [];
    let buf = '';
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        if (buf) { paragraphs.push(buf); buf = ''; }
      } else if (!line.startsWith('<AuthorCredit')) {
        buf = buf ? buf + ' ' + line : line;
      }
    }
    if (buf) paragraphs.push(buf);
    if (heading) articles.push({ heading, paragraphs });
  }
  return articles;
}

function parseMdx(raw: string): { today: TimeslotBlock[]; tomorrow: TimeslotBlock[]; articles: Article[] } {
  const todayMatch = raw.match(/<Schedule day="today">([\s\S]*?)<\/Schedule>/);
  const tomorrowMatch = raw.match(/<Schedule day="tomorrow">([\s\S]*?)<\/Schedule>/);
  return {
    today: todayMatch ? extractTimeslots(todayMatch[1]) : [],
    tomorrow: tomorrowMatch ? extractTimeslots(tomorrowMatch[1]) : [],
    articles: extractArticles(raw),
  };
}

// ── Measurement ──────────────────────────────────────────────────

function measureSchedule(blocks: TimeslotBlock[], sizePt: number): number {
  let total = 0;
  for (let i = 0; i < blocks.length; i++) {
    for (const event of blocks[i].events) {
      total += measureHeight(event, sizePt, SCHEDULE_W);
    }
    if (i < blocks.length - 1) total += 1.5; // gap between timeslots
  }
  // Add heading height
  total += sizePt * LINE_H_RATIO;
  return total;
}

function measureArticleHeight(art: Article, bodySize: number, headingSize: number, colW: number): number {
  let h = measureHeight(art.heading, headingSize, colW);
  for (const para of art.paragraphs) {
    h += measureHeight(para, bodySize, colW);
  }
  return h;
}

function findBestSize(
  blocks: TimeslotBlock[],
  targetSize: number,
  maxHeight: number,
  colW: number,
): number {
  const h = measureSchedule(blocks, targetSize);
  if (h <= maxHeight) return targetSize;

  let lo = 7, hi = targetSize;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (measureSchedule(blocks, mid) <= maxHeight) lo = mid;
    else hi = mid;
  }
  return Math.round(lo * 10) / 10;
}

function findPage1Split(
  articles: Article[],
  bodySize: number,
  headingSize: number,
  scheduleTodayH: number,
): number {
  // Page 1 article capacity (conservative: narrow width only):
  //   PAGE_H total, minus schedule heading ~16pt
  const capacity = PAGE_H;
  let used = 0;
  for (let i = 0; i < articles.length; i++) {
    used += measureArticleHeight(articles[i], bodySize, headingSize, ARTICLE_W);
    if (used > capacity) return i;
  }
  return articles.length;
}

// ── Frontmatter ──────────────────────────────────────────────────

function updateFrontmatter(raw: string, sizes: { scheduleSize: number; bodySize: number; headingSize: number; page1Articles: number }): string {
  const parts = raw.split('---');
  if (parts.length < 3) return raw;
  let fm = parts[1]
    .replace(/^printScheduleSize:.*\n?/gm, '')
    .replace(/^printBodySize:.*\n?/gm, '')
    .replace(/^printHeadingSize:.*\n?/gm, '')
    .replace(/^printPage1Articles:.*\n?/gm, '')
    .trimEnd();
  fm += `\nprintScheduleSize: ${sizes.scheduleSize}`;
  fm += `\nprintBodySize: ${sizes.bodySize}`;
  fm += `\nprintHeadingSize: ${sizes.headingSize}`;
  fm += `\nprintPage1Articles: ${sizes.page1Articles}`;
  return `---${fm}\n---${parts.slice(2).join('---')}`;
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const files = (await readdir(DAYS_DIR)).filter(f => f.endsWith('.mdx'));

  for (const file of files) {
    const filePath = join(DAYS_DIR, file);
    const raw = readFileSync(filePath, 'utf-8');
    const { today, tomorrow, articles } = parseMdx(raw);

    if (today.length === 0 && tomorrow.length === 0) {
      console.log(`⚠ ${file}: no schedule found, skipping`);
      continue;
    }

    // Find schedule size that fits the taller of two schedules
    const todayH = measureSchedule(today, TARGET_SCHEDULE);
    const tomorrowH = measureSchedule(tomorrow, TARGET_SCHEDULE);
    const maxSchedH = Math.max(todayH, tomorrowH);
    const allBlocks = [...today, ...tomorrow];

    let scheduleSize = TARGET_SCHEDULE;
    if (maxSchedH > PAGE_H) {
      scheduleSize = findBestSize(allBlocks, TARGET_SCHEDULE, PAGE_H, SCHEDULE_W);
    }

    // Article sizes
    let bodySize = TARGET_BODY;
    let headingSize = TARGET_HEADING;
    const totalColSpace = 2 * PAGE_H; // one page-column per page
    const totalH = articles.reduce((sum, a) => sum + measureArticleHeight(a, TARGET_BODY, TARGET_HEADING, ARTICLE_W), 0);

    if (totalH > totalColSpace) {
      let bestBody = 7;
      for (let tryBody = 1; tryBody <= TARGET_BODY; tryBody += 0.25) {
        const tryH = tryBody * 1.45;
        const th = articles.reduce((sum, a) => sum + measureArticleHeight(a, tryBody, tryH, ARTICLE_W), 0);
        if (th <= totalColSpace) bestBody = tryBody;
        else break;
      }
      bodySize = Math.round(bestBody * 100) / 100;
      headingSize = Math.round(bestBody * 1.45 * 10) / 10;
    }

    const page1Articles = findPage1Split(articles, bodySize, headingSize, measureSchedule(today, scheduleSize));

    const updated = updateFrontmatter(raw, { scheduleSize, bodySize, headingSize, page1Articles });
    writeFileSync(filePath, updated, 'utf-8');

    console.log(`📐 ${file}:`);
    console.log(`   Schedule: ${scheduleSize}pt (today ${today.length} + tomorrow ${tomorrow.length} blocks)`);
    console.log(`   Body:     ${bodySize}pt, Heading: ${headingSize}pt`);
    console.log(`   Split:    first ${page1Articles} of ${articles.length} articles → page 1`);
  }
}

main().catch(console.error);
