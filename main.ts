// token-radar-01 — the radar's build program, round 7 (recorded rewrite).
//
// What it does, end to end: read the sealed DefiLlama snapshot, score every
// protocol with the comparables curve in ./lib/model.ts, and write the entry
// an output directory holds:
//
//   board.json      the whole ranked board, {"rows": [...]}
//   dashboard/      the page's three source files plus a generated data.js
//   screenshots/    the three dashboard screenshots, copied through
//   dossier.json    what ./vendor/makefun-board.ts writes from the two above
//
// Everything the board claims is computed here at build time from the
// snapshot alone — the curve, its category adjustments, its out-of-sample
// tests, the peer launch rates, the farm verdicts — never written in by
// hand. Run it as:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
//
// The output directory defaults to `out` next to the working directory; the
// snapshot defaults to the kit's sealed input. The build is deterministic:
// the same snapshot writes the same bytes, run after run.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The dossier's text cap, in UTF-8 bytes, as the competition's rules set it. */
const DOSSIER_TEXT_CAP = 65536;

/** The page's source files, copied into the output dashboard unchanged. */
const PAGE_FILES = ['index.html', 'app.css', 'app.js'] as const;

/** Read `--input <path>` off the command line, else the kit's sealed input. */
function snapshotPath(): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) return argv[i + 1]!;
  }
  return '../token-radar-01-kit/input/snapshot.json';
}

/** A share as one decimal place of per cent: 0.32 -> "32.0". */
const oneDecimalPct = (share: number): string => (share * 100).toFixed(1);

/** A share as a whole per cent: 0.297 -> "30". */
const wholePct = (share: number): string => String(Math.round(share * 100));

/** A held-out error to three decimals, trailing zeros trimmed: 0.57, not 0.570. */
const threeDecimals = (n: number): string => String(Math.round(n * 1000) / 1000);

/** A backtest number to four decimals, as the curve line prints it. */
const fourDecimals = (n: number): string => n.toFixed(4);

/**
 * One term test as the build log prints it: the variant that adds (or, for
 * `adj`, removes) the term, each held-out score beside the base curve scored
 * on the same rows. A term test is
 * [code, coef, v5, v5w, vl, vlw, vw, vww, b5, b5w, bl, blw, bw, bww].
 */
function termTestLine(test: readonly [string, number | null, number, number, number, number, number, number, number, number, number, number, number, number]): string {
  const [code, , v5, v5w, vl, vlw, vw, vww, b5, b5w, bl, blw, bw, bww] = test;
  const variant = `5f ${threeDecimals(v5)}/${wholePct(v5w)}% loo ${threeDecimals(vl)}/${wholePct(vlw)}% wf ${threeDecimals(vw)}/${wholePct(vww)}%`;
  const base = `base ${threeDecimals(b5)}/${wholePct(b5w)}%, ${threeDecimals(bl)}/${wholePct(blw)}%, ${threeDecimals(bw)}/${wholePct(bww)}%`;
  return `${code}: ${variant} (${base})`;
}

function main(): void {
  const input = snapshotPath();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? 'out';
  const here = dirname(fileURLToPath(import.meta.url));

  const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
  const { board, radar } = buildRadar(snapshot);

  const issue = boardIssue(board, snapshot);
  if (issue !== null) {
    console.error(`token radar: board refused: ${issue}`);
    process.exit(1);
  }

  const dashDir = join(outDir, 'dashboard');
  const shotDir = join(outDir, 'screenshots');
  mkdirSync(dashDir, { recursive: true });
  mkdirSync(shotDir, { recursive: true });

  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

  for (const file of PAGE_FILES) copyFileSync(join(here, 'dashboard', file), join(dashDir, file));
  writeFileSync(join(dashDir, 'data.js'), dataScript(radar));

  const shots = readdirSync(join(here, 'screenshots'))
    .filter((name) => name.endsWith('.jpg'))
    .sort();
  for (const shot of shots) copyFileSync(join(here, 'screenshots', shot), join(shotDir, shot));

  const dossierBytes = buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_CAP });
  writeFileSync(join(outDir, 'dossier.json'), dossierBytes);
  const dossier = JSON.parse(Buffer.from(dossierBytes).toString('utf8')) as { text: string };
  const textBytes = Buffer.byteLength(dossier.text, 'utf8');
  const whole = !dossier.text.includes('[Cut at');

  const candidates = board.filter((row) => row.launch_rank !== null);
  const farmAtTop = candidates.filter((row) => row.economics.farm_breakeven_share_pct <= 15).length;
  const farmAtLow = candidates.filter((row) => row.economics.farm_breakeven_share_pct <= 5).length;
  const odds = radar.odds.buckets
    .map((bucket) => `${bucket.a}d+ ${wholePct(bucket.r)}% (n=${bucket.n})`)
    .join(', ');

  const { fit, backtest, audit, verdicts } = radar;
  // The first line's "pre-token" count is the launch-candidate count
  // (ranked_pre), not every pre-token row: the 144 not-a-launch rows are
  // counted separately, in the verdicts line below.
  console.log(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
      `${board.length} rows scored (${audit.ranked_pre} pre-token, ${audit.launched} launched, ` +
      `${audit.launched_mcap} of them with a recorded market cap)`,
  );
  console.log(
    `token radar: curve log10(mcap) = ${fit.intercept} + ${fit.slope} x log10(TVL) on ${fit.n_comps} comps, ` +
      `R2 ${fourDecimals(fit.r2)}; 5-fold CV median |log10| ${fourDecimals(backtest.cv_median_abs_log10)}, ` +
      `${oneDecimalPct(backtest.cv_within_2x)}% within 2x (median baseline ${fourDecimals(backtest.baseline_cv_median_abs_log10)}); ` +
      `blind median ratio ${fourDecimals(backtest.blind_median_ratio)}`,
  );
  console.log(
    `token radar: leave-one-out median |log10| ${fourDecimals(backtest.loo_median_abs_log10)}, ` +
      `${oneDecimalPct(backtest.loo_within_2x)}% within 2x; walk-forward (oldest 2/3 -> newest 1/3) ` +
      `median |log10| ${fourDecimals(backtest.wf2_median_abs_log10)}, ${oneDecimalPct(backtest.wf2_within_2x)}% within 2x`,
  );
  console.log(
    `token radar: term tests (variant vs base on the same rows, median |log10| / within 2x): ` +
      backtest.term_tests.map(termTestLine).join('; '),
  );
  console.log(
    `token radar: launch-candidate verdicts FARM ${verdicts.FARM}, THIN ${verdicts.THIN}, SKIP ${verdicts.SKIP}; ` +
      `audited ${audit.pre_token} pre-token protocols (${audit.ranked_pre} launch candidates, ` +
      `${audit.not_launch} not a launch, ${audit.not_launch} with usage plans)`,
  );
  console.log(
    `token radar: FARM break-even at or below the 15% band top for ${farmAtTop} of ${audit.ranked_pre} candidates, ` +
      `at or below the 5% low end for ${farmAtLow} (every candidate nets $0 at the low end, ` +
      `so the net-$0 break-even does not discriminate)`,
  );
  console.log(`token radar: peer launch rates by age: ${odds}; no date ${wholePct(radar.odds.u)}%`);
  console.log(
    `token radar: dossier text ${textBytes} bytes of the ${DOSSIER_TEXT_CAP} cap, ` +
      (whole ? 'all dashboard files whole' : 'some dashboard files cut'),
  );
  console.log(
    `token radar: wrote ${join(outDir, 'board.json')}, ${dashDir} (${PAGE_FILES.length} files + data.js), ` +
      `${shotDir} (${shots.length} images) and ${join(outDir, 'dossier.json')}`,
  );
}

main();
