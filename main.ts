// A working token-radar-01 entry, round 6 (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every protocol in it with the model in lib/model.ts — the 198 launch candidates
// (pre-token protocols that pass the watchlist's exclusion rule), ranked by implied launch
// value, the 144 pre-token protocols that fail the rule, set aside with their reasons and
// usage plans, and all 416 whose token already trades, ranked by their market cap where
// the snapshot records one (else the curve's estimate, labelled as one) — writes the
// ranked board to /output/board.json, and copies this repository's dashboard/ and
// screenshots/ to /output. The dashboard's data is written beside the page as dashboard/data.js,
// so the page renders with no network and no fetch. Last, it writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Round 6 keeps round 5's board — launch rank 1..198 over candidates only, the 144
// not-a-launch rows apart with their reasons, FARM verdicts on candidates only — and adds
// three things the live top 10 all show and round 5 did not. First, every value term is
// tested held-out three ways (5-fold, leave-one-out, walk-forward) and the numbers are
// printed on the dashboard: the category adjustment earns its keep, the fitted growth term
// has the wrong sign, the fitted log-age term is destroyed out of time, and chain count
// predicts nothing — so growth and maturity stay stated priors, and the base curve stands
// for the third round in a row (see lib/model.ts and round-6-report.md for the full
// challenger table; no structural challenger cleared the 0.02 dex noise guard on two
// protocols). Second, every farm carries its break-even pool share — the share of implied
// value at which the farm nets zero — in the farm plan and the detail economics, so a
// reader sees at a glance whether the farm pays even at the top of the 5-15% band.
// Third, the dashboard shows each row's value as its full equation and its rank range
// inside the 90% band, and answers its own checks on the cover (watchlist 40/40, 758/758
// accounted, verdicts summing to 198). No protocol name is ever special-cased: the same
// functions score every row, and the curve's coefficients and its out-of-sample tests are
// computed from the snapshot at build time, never written in by hand.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const preRows = board.filter((r) => r.launch_rank !== null);
const notLaunchRows = board.filter((r) => r.not_launch_reason !== null);
const launchedRows = board.filter((r) => r.token_status === 'launched');
const launchedMcap = launchedRows.filter((r) => r.value_basis === 'market-cap');
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
writeFileSync(join(out, 'dashboard', 'data.js'), dataScript(radar));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// Read the dossier back so the build itself reports the hard cap the judge enforces:
// the dashboard text must fit in 65,536 bytes with no file cut short.
const dossierText = (JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8')) as { text: string }).text;
const dossierBytes = Buffer.byteLength(dossierText, 'utf8');
if (dossierText.includes('[Cut at')) {
  process.stderr.write(`token radar: dossier text is ${dossierBytes} bytes and a dashboard file was cut short — the judge reads less than the whole page\n`);
}

// Round-6 build report: the curve, its three held-out protocols, the four term
// tests, and the break-even census — the numbers the dashboard prints.
const beFarmTop = preRows.filter((r) => r.economics.farm_breakeven_share_pct <= 15).length;
const beFarmLow = preRows.filter((r) => r.economics.farm_breakeven_share_pct <= 5).length;
const termLine = radar.backtest.term_tests
  .map((t) => `${t[0]}: 5f ${t[2]}/${Math.round(t[3] * 100)}% loo ${t[4]}/${Math.round(t[5] * 100)}% wf ${t[6]}/${Math.round(t[7] * 100)}% (base ${t[8]}/${Math.round(t[9] * 100)}%, ${t[10]}/${Math.round(t[11] * 100)}%, ${t[12]}/${Math.round(t[13] * 100)}%)`)
  .join('; ');
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${preRows.length} pre-token, ${launchedRows.length} launched, ${launchedMcap.length} of them with a recorded market cap)\n` +
    `token radar: curve log10(mcap) = ${radar.fit.intercept} + ${radar.fit.slope} x log10(TVL) on ${radar.fit.n_comps} comps, R2 ${radar.fit.r2}; ` +
    `5-fold CV median |log10| ${radar.backtest.cv_median_abs_log10}, ${(radar.backtest.cv_within_2x * 100).toFixed(1)}% within 2x (median baseline ${radar.backtest.baseline_cv_median_abs_log10}); ` +
    `blind median ratio ${radar.backtest.blind_median_ratio}\n` +
    `token radar: leave-one-out median |log10| ${radar.backtest.loo_median_abs_log10}, ${(radar.backtest.loo_within_2x * 100).toFixed(1)}% within 2x; ` +
    `walk-forward (oldest 2/3 -> newest 1/3) median |log10| ${radar.backtest.wf2_median_abs_log10}, ${(radar.backtest.wf2_within_2x * 100).toFixed(1)}% within 2x\n` +
    `token radar: term tests (variant vs base on the same rows, median |log10| / within 2x): ${termLine}\n` +
    `token radar: launch-candidate verdicts FARM ${radar.verdicts.FARM}, THIN ${radar.verdicts.THIN}, SKIP ${radar.verdicts.SKIP}; audited ${radar.audit.pre_token} pre-token protocols (${radar.audit.ranked_pre} launch candidates, ${radar.audit.not_launch} not a launch, ${notLaunchRows.length} with usage plans)\n` +
    `token radar: FARM break-even at or below the 15% band top for ${beFarmTop} of ${preRows.length} candidates, at or below the 5% low end for ${beFarmLow} (every candidate nets $0 at the low end, so the net-$0 break-even does not discriminate)\n` +
    `token radar: peer launch rates by age: ${radar.odds.buckets.map((b) => `${b.a}d+ ${Math.round(b.r * 100)}% (n=${b.n})`).join(', ')}; no date ${Math.round(radar.odds.u * 100)}%\n` +
    `token radar: dossier text ${dossierBytes} bytes of the ${TEXT_MAX_BYTES} cap${dossierText.includes('[Cut at') ? ' — CUT, a dashboard file is not whole' : ', all dashboard files whole'}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (${dashFiles.length} files + data.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
