/**
 * print-preview — live print layout iteration for Eliot Newsletter.
 *
 * Spawns astro dev, watches for MDX rebuilds, regenerates a PDF,
 * and opens it in Preview.app (which auto-refreshes on file change).
 *
 * Usage:
 *   pnpm print-preview               # latest non-draft day
 *   pnpm print-preview 2026-07-16    # specific day
 */
import { spawn, execSync } from 'node:child_process';
import { watchFile, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PI_DIR = '.pi';
const MARKER = join(PI_DIR, 'print-rebuild-trigger');
const DEBOUNCE_MS = 500;

// ── Day auto-detection ───────────────────────────────────────────

async function findLatestNonDraft(): Promise<string> {
  const daysDir = join(import.meta.dirname, '..', 'src', 'days');
  const files = (await readdir(daysDir)).filter(f => f.endsWith('.mdx'));
  const candidates: { date: Date; slug: string }[] = [];

  for (const file of files) {
    const raw = readFileSync(join(daysDir, file), 'utf-8');
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    if (/draft:\s*true/.test(fm)) continue;
    const dateMatch = fm.match(/date:\s*(.+)/);
    if (!dateMatch) continue;
    const date = new Date(dateMatch[1]);
    if (isNaN(date.getTime())) continue;
    candidates.push({ date, slug: date.toISOString().split('T')[0] });
  }

  candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
  if (candidates.length === 0) throw new Error('No non-draft days found');
  return candidates[0].slug;
}

// ── Server startup ───────────────────────────────────────────────

/** Spawn astro dev and wait for it to be ready. Returns the base URL. */
async function startDevServer(): Promise<{ url: string; proc: ReturnType<typeof spawn> }> {
  return new Promise((resolve, reject) => {
    const astro = spawn('pnpm', ['dev'], {
      env: { ...process.env, PRINT_PREVIEW: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        astro.kill();
        reject(new Error('astro dev did not start within 30s'));
      }
    }, 30_000);

    // Pipe stderr to parent so errors are visible
    astro.stderr?.pipe(process.stderr);

    // Watch stdout for the "Local" URL line
    let buf = '';
    astro.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);  // echo to parent
      buf += chunk.toString();
      if (resolved) return;

      const match = buf.match(/Local\s+(https?:\/\/[^\s]+)/);
      if (match) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ url: match[1].replace(/\/$/, ''), proc: astro });
      }
    });

    astro.on('error', (err) => {
      if (!resolved) { resolved = true; clearTimeout(timeout); reject(err); }
    });
  });
}

// ── PDF generation ───────────────────────────────────────────────

async function generatePdf(pageUrl: string, pdfPath: string): Promise<void> {

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: pdfPath,
    format: 'legal',
    printBackground: true,
  });

  await browser.close();
  console.log(`  ✓ PDF written to ${pdfPath}`);
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const argDate = process.argv[2];
  const dateSlug = argDate || await findLatestNonDraft();

  if (!existsSync(PI_DIR)) mkdirSync(PI_DIR);

  console.log(`📄 print-preview — ${dateSlug}`);
  console.log(`   Starting astro dev...`);

  const { url: devUrl, proc: astro } = await startDevServer();

  const cleanup = () => { astro.kill(); };

  // Clean up astro on exit
  let exiting = false;
  const exit = () => {
    if (exiting) return;
    exiting = true;
    cleanup();
    process.exit();
  };
  process.on('SIGINT', exit);
  process.on('SIGTERM', exit);

  try {
    const pageUrl = `${devUrl}/${dateSlug}/`;
    const pdfPath = join(PI_DIR, `${dateSlug}.pdf`);
    console.log(`   Dev server at ${devUrl}`);

    console.log(`   Generating initial PDF...`);
    await generatePdf(pageUrl, pdfPath);

    // Touch marker so watcher has something to observe
    writeFileSync(MARKER, Date.now().toString());

    // Open in Preview.app (auto-refreshes on file change)
    execSync(`open -a Preview "${pdfPath}"`);

    // Watch the marker file (polling — reliable on macOS)
    let debounce: ReturnType<typeof setTimeout> | undefined;
    watchFile(MARKER, { interval: 300 }, () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log(`   Rebuilding PDF...`);
        await generatePdf(pageUrl, pdfPath);
      }, DEBOUNCE_MS);
    });

    console.log(`   Watching for changes — edit & save to rebuild`);
  } catch (err) {
    console.error(err);
    cleanup();
    process.exit(1);
  }
}

main();
