// A working token-radar-01 entry, round 4 (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every protocol in it with the model in lib/model.ts — all 342 that record no token,
// ranked by implied launch value, and all 416 whose token already trades, ranked by their
// market cap where the snapshot records one (else the curve's estimate, labelled as one) —
// writes the ranked board to /output/board.json, and copies this repository's dashboard/ and
// screenshots/ to /output. The dashboard's data is written beside the page as dashboard/data.js,
// so the page renders with no network and no fetch. Last, it writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// The model is the entry's own claim: a log-log comparables curve fitted at build time on the
// snapshot's own live-token protocols, with a shrunk category adjustment, times a log-dampened
// growth multiplier, times a maturity premium for how long the protocol has run with no token.
// Every pre-token farm plan is netted to the dollar at the low end of the airdrop band and
// carries a FARM / THIN / SKIP verdict; every launched row's plan is post-launch usage
// (liquidity, staking, governance) and its economics state the realised value instead.
// No protocol name is ever special-cased: the same functions score every row, and the curve's
// coefficients and its out-of-sample tests are computed from the snapshot at build time,
// never written in by hand.
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
const preRows = board.filter((r) => r.token_status === 'pre-token');
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

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${preRows.length} pre-token, ${launchedRows.length} launched, ${launchedMcap.length} of them with a recorded market cap)\n` +
    `token radar: curve log10(mcap) = ${radar.fit.intercept} + ${radar.fit.slope} x log10(TVL) on ${radar.fit.n_comps} comps, R2 ${radar.fit.r2}; ` +
    `5-fold CV median |log10| ${radar.backtest.cv_median_abs_log10}, ${(radar.backtest.cv_within_2x * 100).toFixed(1)}% within 2x (median baseline ${radar.backtest.baseline_cv_median_abs_log10}); ` +
    `blind median ratio ${radar.backtest.blind_median_ratio}\n` +
    `token radar: pre-token verdicts FARM ${radar.verdicts.FARM}, THIN ${radar.verdicts.THIN}, SKIP ${radar.verdicts.SKIP}; audited ${radar.audit.pre_token} pre-token protocols (${radar.audit.old_rule_excluded} the round-3 rule would have set aside)\n` +
    `token radar: dossier text ${dossierBytes} bytes of the ${TEXT_MAX_BYTES} cap${dossierText.includes('[Cut at') ? ' — CUT, a dashboard file is not whole' : ', all dashboard files whole'}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'dashboard')} (${dashFiles.length} files + data.js), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
