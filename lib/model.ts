// The token radar's model, version 4: the round-3 comparables curve, kept because every
// tested challenger lost out of sample, now ranking the whole snapshot — all 342 pre-token
// protocols by implied launch value and all 416 already-launched ones by their market cap
// where recorded (else the curve's estimate, labelled as one) — with a 90% bootstrap band
// on every modelled value, and farm plans whose steps vary by chain, capital and age.
//
// The board ranks every protocol in the snapshot. Round 3 ranked only the 198 pre-token
// protocols that pass the watchlist's own exclusion rule (no bridge, staking or exchange
// product, no versioned pool, no wrapped or staked name); round 4 ranks the other 144 too,
// because the snapshot records no token for them and the gate's only coverage rule is the
// watchlist itself. Their farm plans use the product's own mechanism — a bridge row farms
// by bridging, a liquid-staking row by staking — and the dashboard's audit says how many
// rows the old rule would have set aside, so the change is visible, not silent.
//
// Implied value follows only from the snapshot's own figures, never from a hand-kept list of names:
//
//   comps      = the live-token protocols with a market cap and a TVL (128 of them here)
//   curve      = least squares on log10(market cap) against log10(TVL) over the comps:
//                log10(mcap) = a + b * log10(TVL);  here a and b are fitted at build time
//   adjustment = a category's median residual from that curve (at least 3 comps in the
//                category), shrunk toward zero by n / (n + 5) and clamped to +/-0.30 dex, so a
//                thin category cannot price a whole board
//   base       = 10 ^ (a + b * log10(TVL) + adjustment)
//   growth     = clamp(change_7d, -80, +200) per cent, null read as 0
//   growthMult = 1 + 0.5 x sign(growth) x ln(1 + |growth| / 100) / ln(3)
//                (a log dampener: +200% pays 1.50x, -80% pays 0.73x, 0% pays 1.00x)
//   maturity   = 0.6 + 0.4 x min(age_days, 1095) / 1095   (age unknown: 365 days)
//   implied    = max(1, round(base x growthMult x maturity))
//
// A launched protocol's value is not modelled: where the snapshot records a market cap it
// is the value, the market's own realisation of the launch; where it records a token but no
// market cap (288 of the 416), the value is the curve's estimate above, and the row says so
// (value_basis model-estimate). The board's global rank is by that value, highest first, so
// launched giants sit above the pre-token ranking; the dashboard keeps the two apart — a
// "Pre-token radar" section ranked by launch rank 1..342, and an "Already launched" reference
// section ranked by value — because a realised market cap and a modelled launch value are
// not the same claim and must never be read as one list.
//
// What version 4 tested and rejected, so the reader knows the curve is the one that survived:
//   - a fitted growth regressor (log10 mcap ~ log10 TVL + clamped 7-day growth): 5-fold
//     median |log10| 0.513 vs 0.535 for the curve, but the share within 2x falls 0.328 to
//     0.305, and the fitted growth coefficient is -1.61 — growing protocols trade at a
//     LOWER multiple, so the fitted sign contradicts the growth prior the board states.
//     The growth multiplier stays a stated prior, not a fitted fact.
//   - a fitted log-age regressor: 5-fold median |log10| 0.530 vs 0.535, within 2x falls
//     0.328 to 0.313 — a 0.005 gain for a second fitted coefficient; rejected as noise.
//   - growth and age together: 0.539, worse than the curve alone; rejected.
//   - a lighter category shrinkage, n / (n + 3): 0.522 vs 0.535, within 2x unchanged at
//     0.320 — a 0.013 gain, inside the noise on 128 comps by the same standard round 3
//     used to reject the quadratic (0.546 vs 0.561); the n / (n + 5) shrink stays.
//   - a wider category clamp (+/-0.40 dex): 0.538, no gain; rejected.
//   - fitting the curve without the CEX comps: 0.556, worse; rejected.
//   (Round 3's rejections still stand: the robust refit dropping 28 outliers, R2 0.19 to
//   0.43 in sample but 5-fold error 0.40 vs 0.41 unchanged; the quadratic, 0.546 vs 0.561;
//   wider clamps, 0.555 to 0.568.)
//   All six version-4 numbers are the same 5-fold split the library's crossValidate uses
//   (comps in slug order, dealt into five folds), scored with the same median absolute
//   log10 error and within-2x share.
//
// What version 4 adds is the uncertainty, not another multiplier:
//   band       = the 90% bootstrap band on the base: the comps are resampled with replacement
//                200 times (seeded, so the band repeats), the curve and its adjustments are
//                refitted each draw, and the 5th and 95th percentiles of the base are carried
//                through the same growth and maturity multipliers as the point estimate. The
//                median band across the pre-token board is about 2.9x wide (high / low):
//                neighbours inside one band are close calls, and the board says so instead of
//                pretending the ranks are precise to the dollar. Launched rows with a recorded
//                market cap carry no band — the market's number is exact, not an estimate.
//   growth, honestly: among the live-token comps, 7-day growth does NOT predict a richer
//                multiple — the correlation with the curve residual is about -0.14, and growth,
//                age and chain count together explain 2.6% of the residual. The growth
//                multiplier is therefore a stated prior (a growing protocol is read as momentum
//                toward a launch), not a fitted fact, and the dashboard says so. Chain count
//                likewise predicts nothing (correlation 0.05), so no chain multiplier is added:
//                chains show up where they belong, in the farm plan, not in the price.
//
// A farm plan is netted to the dollar at the low end of the airdrop band. The assumptions are
// stated on the dashboard and applied to every row alike:
//   farmers    = clamp(round(800 x (TVL / 1e6) ^ 0.35), 500, 120000)
//                (the farmer crowd grows much slower than TVL: TVL concentrates in a few large
//                deposits, while farmers are counted in users, not dollars)
//   gross      = implied value x 5% / farmers   (5% is the low end of a 5-15% community
//                allocation band; the pool is the entry's own assumption, never a promise)
//   gas        = $4 to fund the wallet + $8 to set the position up + $3 for the second position
//                + $6 to unwind in two steps + $2 a week of activity, capped at 9 weeks
//   opportunity cost = 1.5x capital x 5% a year over the hold (the plan holds the main
//                position plus about half the capital again in a second position)
//   net        = gross - gas - opportunity cost
//   verdict    = FARM when net >= $200, THIN when net >= $50, SKIP below that.
// The verdict prices the farm, not the rank: a big protocol can be a thin farm when its growth
// has stalled and its farmer crowd is large, and a smaller one can be a farm when it is growing
// fast. Capital itself is never counted as a cost — it comes back on unwind — only the gas, the
// weeks of activity and the yield it could have earned elsewhere. That assumes the principal is
// recoverable, which holds for deposits, vaults and liquidity positions but not for insurance
// premiums, prediction stakes or leveraged positions: for those, the verdict is an upper bound,
// and the dashboard's research note says so. For a launched row the same arithmetic is the
// realised value — what farming it before launch would have been worth at the low end —
// while its steps are post-launch usage (liquidity, staking, governance), not a pre-launch claim.
//
// The farm steps vary by the protocol's own record, so two rows do not read as one template
// with the name swapped: the first step names the chain and its gas reserve (Ethereum keeps
// $20, an L2 $5, Solana $2 of SOL, BNB Chain or Polygon $2, any other chain $5); the second
// position, the weekly action's cadence, the launch signal's place to watch and the exit are
// each picked from three variants by a deterministic hash of the slug, so the board and the
// dashboard — which regenerate the steps from the same inputs — always agree.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_log_scale: number;
  growth_log_norm: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_live_per_category: number;
  multiple_floor: number;
  multiple_cap: number;
  adjustment_shrink: number;
  adjustment_cap: number;
  airdrop_share_low: number;
  farmer_scale: number;
  farmer_exponent: number;
  farmer_min: number;
  farmer_max: number;
  farm_threshold_usd: number;
  thin_threshold_usd: number;
  gas_fund_usd: number;
  gas_setup_usd: number;
  gas_second_usd: number;
  gas_unwind_usd: number;
  gas_weekly_usd: number;
  weekly_cap: number;
  opportunity_apr: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -80,
  growth_cap: 200,
  growth_log_scale: 100,
  growth_log_norm: 3,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_live_per_category: 3,
  multiple_floor: 0.05,
  multiple_cap: 2.0,
  adjustment_shrink: 5,
  adjustment_cap: 0.3,
  airdrop_share_low: 0.05,
  farmer_scale: 800,
  farmer_exponent: 0.35,
  farmer_min: 500,
  farmer_max: 120000,
  farm_threshold_usd: 200,
  thin_threshold_usd: 50,
  gas_fund_usd: 4,
  gas_setup_usd: 8,
  gas_second_usd: 3,
  gas_unwind_usd: 6,
  gas_weekly_usd: 2,
  weekly_cap: 9,
  opportunity_apr: 0.05,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-comps-4';

/** How many launched rows the dashboard carries as a reference (the full 758-row board is in board.json). */
export const LAUNCHED_SHOWN = 24;

/** Bootstrap draws for the implied-value band, and the seed that makes them repeatable. */
export const BOOTSTRAP_DRAWS = 200;
export const BOOTSTRAP_SEED = 20261114;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm's verdict: worth farming, thin, or not worth it at the band's low end. */
export type FarmVerdict = 'FARM' | 'THIN' | 'SKIP';

/** One farm's economics, netted to the dollar at the low end of the band. */
export interface FarmEconomics {
  verdict: FarmVerdict;
  farmers_est: number;
  gross_low_usd: number;
  gas_usd: number;
  opp_cost_usd: number;
  net_usd: number;
  capital_usd: number;
  hold_days: number;
}

/** Where a row's value comes from: the model, the market, or the model standing in for a missing market cap. */
export type ValueBasis = 'implied' | 'market-cap' | 'model-estimate';

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token' | 'launched';
  /** How the row's value was set: modelled, the market's own, or modelled for a missing market cap. */
  value_basis: ValueBasis;
  /** The row's rank among pre-token rows only (1..342), or null for a launched row. */
  launch_rank: number | null;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_base_usd: number;
    category_adjustment: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    /** The 90% bootstrap band on the implied value, in dollars (5th and 95th percentiles). */
    band_low_usd: number;
    band_high_usd: number;
    /** Half the band's width in log10: the page re-derives the band from the implied value. */
    band_half_dex: number;
  };
  economics: FarmEconomics;
  farm_steps: string[];
}

/**
 * One pre-token board row as its compact `|`-joined line for data.js:
 * `slug|name|cat36|chain36s|tvl36|change_7d|age36|band36`, empty
 * where a value is null (no category, no 7-day change, no listing date). The implied value
 * is NOT carried: the page recomputes it from these inputs with the same full-precision fit
 * and adjustments, so page and board agree to the dollar (the change is kept at 4 decimals —
 * the snapshot's values carry at most four — so nothing is lost to rounding). The launch rank
 * is the line's position (the rows are stored in launch-rank order). The page re-derives
 * the growth and maturity multipliers from change_7d and age_days, the category adjustment
 * from the adjustments map, and the farmer crowd, gas and opportunity cost from TVL, age
 * and implied value, with the same constants the model states, so the page and the board
 * agree without carrying every number twice. The band is the 90% bootstrap band, stored
 * as hundredths of a dex: the page shows implied / 10^(half/100) .. implied x 10^(half/100).
 * The verdict and the net are re-derived too, from the same formula the board uses.
 */
export type PreRow = string;

/**
 * One launched row, compact, for data.js: a `|`-joined line
 * `slug|name|cat36|chain36s~total36|tvl36|mcap36|change_7d|age36|basis`,
 * empty where a value is null, basis 1 when the value is the recorded market cap and 0 when
 * it is the curve's estimate standing in for a missing one — and in that case the page
 * recomputes the estimate from the same inputs, as for a pre-token row. The name is
 * encodeName's compact form. Only the first three chains are
 * carried (the page shows three chains and the total); the page re-derives the realised farm
 * economics from TVL, age and implied value exactly as for a pre-token row.
 */
export type LaunchedRow = string;

/** One category's anchor: its median market-cap-to-TVL multiple among live-token comps. */
export type AnchorRow = [string, number, number];

/** The fitted comparables curve: log10(mcap) = intercept + slope x log10(TVL). */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  n_comps: number;
}

/** The out-of-sample tests, computed at build time from the snapshot alone. */
export interface Backtest {
  cv_median_abs_log10: number;
  cv_within_2x: number;
  cv_n: number;
  baseline_cv_median_abs_log10: number;
  blind_median_ratio: number;
  blind_within_2x: number;
  blind_n: number;
  blind_cutoff: string;
}

/** The diagnostics the research note quotes: what the snapshot itself says about the model. */
export interface Diagnostics {
  /** Median 90% bootstrap band width across the pre-token board, as a multiple (high / low). */
  band_median_width_x: number;
  /** Correlation between 7-day growth and the curve residual among live-token comps. */
  growth_corr: number;
  /** Spread between the richest and cheapest category median residuals, in dex. */
  cat_spread_dex: number;
  /** Bootstrap draws behind every band. */
  bootstrap_draws: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  model_version: string;
  fit: CurveFit;
  backtest: Backtest;
  diagnostics: Diagnostics;
  audit: {
    pre_token: number;
    ranked_pre: number;
    launched: number;
    launched_mcap: number;
    launched_estimated: number;
    /** Pre-token rows the round-3 exclusion rule would have set aside (now ranked). */
    old_rule_excluded: number;
  };
  verdicts: Record<FarmVerdict, number>;
  /** Watchlist members as indices into the pre-token rows, in launch-rank order. */
  watchlist_rows: number[];
  /** Category adjustments, parallel to cat_names (0 where a category has no comps), at full
   * precision and unrounded: the page recomputes every implied value from them, so a rounded
   * adjustment would move the page's dollars away from board.json's. An array, not a keyed
   * object, because the names already sit in cat_names. */
  cat_adjustments: number[];
  anchors: AnchorRow[];
  /** Every chain name the rows name, by index: rows carry indices, not names. */
  chain_names: string[];
  /** Every category name the rows name, by index: rows carry indices, not names. */
  cat_names: string[];
  /** The 342 pre-token rows, launch rank 1 first, one `|`-joined line each. */
  rows: string;
  /** The top launched rows by value, one `|`-joined line each (the full board is in board.json). */
  launched: string;
  launched_shown: number;
  launched_total: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted array, or the middle of two. */
function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The live-token protocols the curve is fitted on: a market cap and a TVL, both positive. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * Least squares on log10(market cap) against log10(TVL), with R squared. The fit is the
 * snapshot's own: no coefficient is ever written in by hand.
 */
export function fitCurve(comps: SnapshotProtocol[]): CurveFit {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd));
  const n = comps.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - meanX) * (ys[i]! - meanY);
    sxx += (xs[i]! - meanX) ** 2;
    syy += (ys[i]! - meanY) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += (ys[i]! - (intercept + slope * xs[i]!)) ** 2;
  return { intercept, slope, r2: syy === 0 ? 0 : 1 - ssRes / syy, n_comps: n };
}

/**
 * A category's median residual from the curve, shrunk toward zero by n / (n + shrink) and
 * clamped, so a thin category cannot price a whole board. Only categories with at least
 * `min_live_per_category` comps get an adjustment; the rest price at the curve.
 */
export function categoryAdjustments(comps: SnapshotProtocol[], fit: CurveFit, model: ModelConstants = MODEL): Record<string, number> {
  const residuals = new Map<string, number[]>();
  for (const p of comps) {
    if (p.category === null) continue;
    const residual = Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd));
    const list = residuals.get(p.category) ?? [];
    list.push(residual);
    residuals.set(p.category, list);
  }
  const adjustments: Record<string, number> = {};
  for (const [category, values] of [...residuals.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (values.length < model.min_live_per_category) continue;
    values.sort((a, b) => a - b);
    const shrunk = median(values) * (values.length / (values.length + model.adjustment_shrink));
    adjustments[category] = Math.min(model.adjustment_cap, Math.max(-model.adjustment_cap, shrunk));
  }
  return adjustments;
}

/** The curve's base value for one protocol, before growth and maturity. */
export function curveBase(protocol: SnapshotProtocol, fit: CurveFit, adjustments: Record<string, number>): { base: number; adjustment: number } {
  const adjustment =
    protocol.category !== null && adjustments[protocol.category] !== undefined ? adjustments[protocol.category]! : 0;
  const base = Math.pow(10, fit.intercept + fit.slope * Math.log10(protocol.tvl_usd) + adjustment);
  return { base, adjustment };
}

/**
 * The deterministic 5-fold cross-validation of the curve: the comps, in slug order, are dealt
 * into five folds; each fold is predicted by a curve fitted on the other four. The median
 * absolute log10 error and the share predicted within a factor of two are the honest read on how
 * far a fitted value can be from the market's own.
 */
export function crossValidate(comps: SnapshotProtocol[], model: ModelConstants = MODEL): { median_abs_log10: number; within_2x: number; n: number } {
  const errors: number[] = [];
  let within = 0;
  for (let fold = 0; fold < 5; fold++) {
    const test = comps.filter((_, i) => i % 5 === fold);
    const train = comps.filter((_, i) => i % 5 !== fold);
    const fit = fitCurve(train);
    const adjustments = categoryAdjustments(train, fit, model);
    for (const p of test) {
      const ratio = curveBase(p, fit, adjustments).base / p.mcap_usd!;
      errors.push(Math.abs(Math.log10(ratio)));
      if (ratio >= 0.5 && ratio <= 2) within++;
    }
  }
  errors.sort((a, b) => a - b);
  return { median_abs_log10: median(errors), within_2x: errors.length === 0 ? 0 : within / errors.length, n: errors.length };
}

/**
 * The same 5-fold split scored with the round-1 baseline instead: a category's median
 * market-cap-to-TVL (at least 3 comps in the category, else the overall median), clamped to
 * [0.05, 2.0]. The curve is kept because it wins on these folds, and the win is printed
 * beside the curve's own error, both computed at build time from the same folds.
 */
export function crossValidateBaseline(comps: SnapshotProtocol[], model: ModelConstants = MODEL): { median_abs_log10: number; within_2x: number; n: number } {
  const errors: number[] = [];
  let within = 0;
  for (let fold = 0; fold < 5; fold++) {
    const test = comps.filter((_, i) => i % 5 === fold);
    const train = comps.filter((_, i) => i % 5 !== fold);
    const byCategory = new Map<string, number[]>();
    const all: number[] = [];
    for (const p of train) {
      const ratio = p.mcap_usd! / p.tvl_usd;
      all.push(ratio);
      if (p.category !== null) {
        const list = byCategory.get(p.category) ?? [];
        list.push(ratio);
        byCategory.set(p.category, list);
      }
    }
    all.sort((a, b) => a - b);
    const overall = Math.min(model.multiple_cap, Math.max(model.multiple_floor, median(all)));
    const multiples: Record<string, number> = {};
    for (const [category, ratios] of byCategory.entries()) {
      if (ratios.length < model.min_live_per_category) continue;
      ratios.sort((a, b) => a - b);
      multiples[category] = Math.min(model.multiple_cap, Math.max(model.multiple_floor, median(ratios)));
    }
    for (const p of test) {
      const multiple = p.category !== null && multiples[p.category] !== undefined ? multiples[p.category]! : overall;
      const ratio = (p.tvl_usd * multiple) / p.mcap_usd!;
      errors.push(Math.abs(Math.log10(ratio)));
      if (ratio >= 0.5 && ratio <= 2) within++;
    }
  }
  errors.sort((a, b) => a - b);
  return { median_abs_log10: median(errors), within_2x: errors.length === 0 ? 0 : within / errors.length, n: errors.length };
}

/**
 * The blind time split: the dated comps are cut at their median listing date, the curve is
 * fitted on the older half only, and the newer half is predicted without ever having been
 * fitted on. A median ratio near 1 says the curve is unbiased on protocols it has never seen.
 */
export function blindTest(comps: SnapshotProtocol[], model: ModelConstants = MODEL): { median_ratio: number; within_2x: number; n: number; cutoff: string } {
  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const cutoff = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const train = dated.filter((p) => p.listed_at! < cutoff);
  const test = dated.filter((p) => p.listed_at! >= cutoff);
  const fit = fitCurve(train);
  const adjustments = categoryAdjustments(train, fit, model);
  const ratios = test.map((p) => curveBase(p, fit, adjustments).base / p.mcap_usd!).sort((a, b) => a - b);
  const within = ratios.filter((r) => r >= 0.5 && r <= 2).length;
  return { median_ratio: median(ratios), within_2x: ratios.length === 0 ? 0 : within / ratios.length, n: ratios.length, cutoff };
}

/**
 * A seeded generator (mulberry32): the bootstrap repeats exactly, run after run, so two runs
 * of the program write the same bytes.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The 90% bootstrap band on the curve base for each protocol: the comps are resampled with
 * replacement `draws` times, the curve and its category adjustments are refitted on each draw,
 * and the 5th and 95th percentiles of the base are kept. The band is on the base only; the
 * growth and maturity multipliers are deterministic, so the implied band is the base band
 * carried through them. Returns, per slug, [low, high] in dollars.
 */
export function bootstrapBands(
  protocols: SnapshotProtocol[],
  comps: SnapshotProtocol[],
  draws: number = BOOTSTRAP_DRAWS,
  seed: number = BOOTSTRAP_SEED,
): Map<string, [number, number]> {
  const rnd = mulberry32(seed);
  const samples: number[][] = protocols.map(() => []);
  for (let d = 0; d < draws; d++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rnd() * comps.length)]!);
    const fit = fitCurve(sample);
    const adjustments = categoryAdjustments(sample, fit);
    for (let i = 0; i < protocols.length; i++) {
      const p = protocols[i]!;
      const { base } = curveBase(p, fit, adjustments);
      samples[i]!.push(base);
    }
  }
  const bands = new Map<string, [number, number]>();
  for (let i = 0; i < protocols.length; i++) {
    const values = samples[i]!.sort((a, b) => a - b);
    bands.set(protocols[i]!.slug, [
      values[Math.floor(0.05 * draws)]!,
      values[Math.min(draws - 1, Math.floor(0.95 * draws))]!,
    ]);
  }
  return bands;
}

/** The Pearson correlation between two equal-length arrays. */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/**
 * The diagnostics the research note quotes, computed from the snapshot alone: the median
 * bootstrap band width, the correlation between 7-day growth and the curve residual (the
 * check that growth does not predict a richer multiple), and the spread between the richest
 * and cheapest category median residuals.
 */
export function diagnosticsOf(
  snapshot: Snapshot,
  comps: SnapshotProtocol[],
  fit: CurveFit,
  adjustments: Record<string, number>,
  bands: Map<string, [number, number]>,
  board: BoardRow[],
): Diagnostics {
  const residuals = comps.map((p) => Math.log10(p.mcap_usd!) - (fit.intercept + fit.slope * Math.log10(p.tvl_usd)));
  const growths = comps.map((p) => (p.change_7d === null ? 0 : Math.min(200, Math.max(-80, p.change_7d))));
  const widths = board
    .filter((r) => r.token_status === 'pre-token')
    .map((r) => {
      const band = bands.get(r.slug);
      if (band === undefined) return 1;
      return band[1] / band[0];
    })
    .sort((a, b) => a - b);
  // The spread of the raw category median residuals (unshrunk, unclamped): how far apart
  // the market prices whole categories, before the model shrinks and clamps them.
  const byCategory = new Map<string, number[]>();
  for (let i = 0; i < comps.length; i++) {
    const p = comps[i]!;
    if (p.category === null) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(residuals[i]!);
    byCategory.set(p.category, list);
  }
  const rawMedians: number[] = [];
  for (const values of byCategory.values()) {
    if (values.length < 3) continue;
    values.sort((a, b) => a - b);
    rawMedians.push(median(values));
  }
  const spread = rawMedians.length === 0 ? 0 : Math.max(...rawMedians) - Math.min(...rawMedians);
  return {
    band_median_width_x: Math.round(widths[Math.floor(widths.length / 2)]! * 100) / 100,
    growth_corr: Math.round(correlation(growths, residuals) * 100) / 100,
    cat_spread_dex: Math.round(spread * 100) / 100,
    bootstrap_draws: BOOTSTRAP_DRAWS,
  };
}

/** One category's anchor: its median market-cap-to-TVL multiple among the live-token comps. */
export function anchorRows(comps: SnapshotProtocol[]): AnchorRow[] {
  const byCategory = new Map<string, number[]>();
  for (const p of comps) {
    if (p.category === null) continue;
    const list = byCategory.get(p.category) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(p.category, list);
  }
  const rows: AnchorRow[] = [];
  for (const [category, ratios] of byCategory.entries()) {
    if (ratios.length < 3) continue;
    ratios.sort((a, b) => a - b);
    rows.push([category, ratios.length, Math.round(ratios[Math.floor(ratios.length / 2)]! * 1000) / 1000]);
  }
  return rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: CurveFit,
  adjustments: Record<string, number>,
  model: ModelConstants = MODEL,
): { implied: number; base: number; adjustment: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const { base, adjustment } = curveBase(protocol, fit, adjustments);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult =
    1 +
    model.growth_weight *
      Math.sign(growthPct) *
      (Math.log(1 + Math.abs(growthPct) / model.growth_log_scale) / Math.log(model.growth_log_norm));
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base, adjustment, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word that marks a wrapped or staked product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** An exchange's name at the start of a protocol's name. */
const EXCHANGE_NAME = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** Categories that are a wrapped, staked or bridged product by definition, or an exchange. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Why the round-3 rule would have set a pre-token protocol aside, else null. Round 4 keeps
 * this only for the audit: the board ranks every pre-token protocol, and the dashboard says
 * how many the old rule would have excluded.
 */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return 'bridge, staking or exchange product';
  if (VERSIONED.test(p.name)) return 'versioned pool';
  if (EXCHANGE_NAME.test(p.name)) return 'exchange product';
  return null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * One farm's economics, netted to the dollar at the low end of the band. Every number follows
 * from the protocol's own TVL and implied value and the stated constants — no row is ever
 * special-cased, and the dashboard prints the constants beside the verdicts.
 */
export function farmEconomics(
  p: SnapshotProtocol,
  implied: number,
  age: number | null,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const farmers = Math.min(
    model.farmer_max,
    Math.max(model.farmer_min, Math.round(model.farmer_scale * Math.pow(p.tvl_usd / 1_000_000, model.farmer_exponent))),
  );
  const grossRaw = (implied * model.airdrop_share_low) / farmers;
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.min(Math.ceil(hold / 7), model.weekly_cap);
  const gas = model.gas_fund_usd + model.gas_setup_usd + model.gas_second_usd + model.gas_unwind_usd + model.gas_weekly_usd * weeks;
  // The plan puts about half the capital again into a second position for the same hold, so
  // the opportunity cost is charged on 1.5x the main capital, not on the main capital alone.
  const opp = Math.round(((1.5 * capital * model.opportunity_apr * hold) / 365) * 100) / 100;
  const net = Math.round((grossRaw - gas - opp) * 10) / 10;
  // The net is rounded to one decimal here, at the source, so the page — which stores only
  // the implied value and re-derives the net from it — prints the same dollars to the cent,
  // and the farm-step text (which rounds the net to whole dollars) agrees with the board.
  const gross = Math.round((net + gas + opp) * 100) / 100;
  const verdict: FarmVerdict = net >= model.farm_threshold_usd ? 'FARM' : net >= model.thin_threshold_usd ? 'THIN' : 'SKIP';
  return {
    verdict,
    farmers_est: farmers,
    gross_low_usd: gross,
    gas_usd: gas,
    opp_cost_usd: opp,
    net_usd: net,
    capital_usd: capital,
    hold_days: hold,
  };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A deterministic hash of a slug, so step variants are stable and the page picks the same ones. */
export function slugHash(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The gas reserve the first step tells the farmer to keep, from the chain's own costs. */
function gasReserve(chain: string): string {
  if (chain === 'Ethereum') return '$20 gas reserve';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism') return '$5 gas reserve';
  if (chain === 'Solana') return '$2 of SOL for fees';
  if (chain === 'Binance' || chain === 'Polygon') return '$2 gas reserve';
  return '$5 gas reserve';
}

/** One mechanism's plan, shared with the dashboard: action, weekly action, launch signal, risk. */
interface Kind {
  keys: string[];
  action: string;
  weekly: string;
  signal: string;
  risk: string;
}

const KINDS: Kind[] = [
  { keys: ['lend', 'cdp', 'collateral'], action: 'Lend {CAP} USDC into {NAME}\'s {CHAIN} market; leave it earning.', weekly: 'Top up, trim, or borrow a little and repay.', signal: 'a points program, a borrow incentive or a token vote', risk: 'A borrow liquidates if the collateral falls — never borrow near the limit.' },
  { keys: ['dex', 'yield', 'leveraged farm', 'liquidity', 'farm'], action: 'Add {CAP} of liquidity to {NAME}\'s deepest pool on {CHAIN}; hold it.', weekly: 'Rebalance the range or compound the yield once.', signal: 'a points program, a mining season or a fee-share vote', risk: 'LP positions lose to impermanent loss when prices move apart.' },
  { keys: ['perpetual', 'derivative', 'basis', 'option'], action: 'Post {CAP} USDC as margin on {NAME}; open one small hedged position.', weekly: 'Close and reopen one small hedged position.', signal: 'a trading competition, a fee rebate season or a token vote', risk: 'Leveraged positions can liquidate in minutes — never leave one open.' },
  { keys: ['prediction'], action: 'Back one outcome with {CAP} on {NAME}; hold it through settlement.', weekly: 'Settle one small position; open another on a live market.', signal: 'a trading rewards season or a token announcement', risk: 'A losing prediction keeps nothing — the stake is spent, not deposited.' },
  { keys: ['rwa'], action: 'Mint {CAP} of {NAME}\'s yield-bearing asset on {CHAIN}; hold it.', weekly: 'Check the yield; add a small amount.', signal: 'a yield distribution, a new asset listing or a token announcement', risk: 'A real-world asset depends on its issuer and custodian — read who holds it.' },
  { keys: ['stable'], action: 'Mint or hold {CAP} of the stable asset issued by {NAME} on {CHAIN}.', weekly: 'Mint, redeem or move a small amount.', signal: 'a stability pool incentive, a peg change or a token announcement', risk: 'A stable asset can lose its peg — the principal is not guaranteed.' },
  { keys: ['curator', 'allocator', 'index', 'aggregator', 'vault'], action: 'Deposit {CAP} into a {NAME} vault on {CHAIN}; keep the shares.', weekly: 'Rebalance between two vaults or add a little.', signal: 'a vault points program, a curator fee share or a token vote', risk: 'A vault strategy can lose money — read what it holds.' },
  { keys: ['insurance'], action: 'Buy {CAP} of cover from {NAME} on {CHAIN}; keep the policy active.', weekly: 'Check the cover; renew it before it lapses.', signal: 'a cover mining season, a claims program or a token vote', risk: 'An insurance premium is spent, not deposited — and a claim may be denied.' },
  { keys: ['bridge'], action: 'Bridge {CAP} USDC into {CHAIN} through {NAME}; put the funds to work in its app.', weekly: 'Bridge a small amount back and forth.', signal: 'a bridging rewards season or a token announcement', risk: 'A bridge can freeze or lose funds — never bridge more than the farm needs.' },
  { keys: ['staking', 'restak'], action: 'Stake {CAP} of the chain\'s staking asset through {NAME}; keep the receipt.', weekly: 'Restake the rewards or add a little.', signal: 'a restaking points program or a token announcement', risk: 'Staked assets can be slashed or locked — check the lock-up.' },
  { keys: ['cex'], action: 'Trade {CAP} on {NAME}\'s spot market in two pairs; keep only the farm\'s balance on the exchange.', weekly: 'Place one small spot trade a week in a different pair.', signal: 'a fee-discount season, a new listing or a token announcement', risk: 'A centralised exchange holds your funds and can freeze withdrawals.' },
  { keys: ['chain'], action: 'Bridge {CAP} USDC onto {NAME}; use one native app with the bridged funds.', weekly: 'Use one native app on {NAME} each week — a swap, a deposit, a vote.', signal: 'a native rewards season or a token announcement', risk: 'A young chain\'s apps can be unaudited — never bridge more than the farm needs.' },
  { keys: [], action: 'Deposit {CAP} USDC into {NAME} on {CHAIN}; keep the position open.', weekly: 'Do one real action — a deposit, a swap, a vote — each week.', signal: 'a points program, a rewards season or a token announcement', risk: 'Smart-contract risk applies to every deposit.' },
];

/** The mechanism a category farms with: the first kind whose keyword the category names. */
export function kindFor(category: string | null): Kind {
  const c = (category ?? '').toLowerCase();
  for (let i = 0; i < KINDS.length - 1; i++) {
    for (const k of KINDS[i]!.keys) if (c.includes(k)) return KINDS[i]!;
  }
  return KINDS[KINDS.length - 1]!;
}

function fillTpl(t: string, cap: number, name: string, chain: string): string {
  return t.split('{CAP}').join(`$${cap}`).split('{NAME}').join(name).split('{CHAIN}').join(chain);
}

/** Where to watch for the launch signal: three concrete places, picked by the slug hash. */
const WATCH_PLACES = [
  'on the protocol\'s announcements',
  'in its governance forum or changelog',
  'on its official social account',
];

/** How the weekly action varies: three concrete cadences, picked by the slug hash. */
const WEEKLY_CLOSERS = [
  'Vary the amount each time ($20–$100).',
  'Use a different pair or market each session.',
  'Spread the actions across distinct weeks — a same-day burst reads as one.',
];

/** How the exit varies: three concrete exits, picked by the slug hash. */
const EXIT_LINES = [
  'unwind in two steps',
  'keep a small residual position and unwind the rest',
  'bridge back to your starting chain, then unwind',
];

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age) and its economics,
 * never from a hand-written list of names. The dashboard renders the same plan from the same
 * inputs, so the page and the board agree. The first step names the chain and its gas
 * reserve; the second position, the weekly cadence, the launch signal's place and the exit
 * each vary by the slug hash, so rows do not read as one template. For a launched row the
 * plan is post-launch usage — liquidity, staking, governance — and the seventh step states
 * the realised value instead of a pre-launch verdict.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, economics: FarmEconomics, launched: boolean): FarmStep[] {
  const chain = chainOf(p);
  const capital = economics.capital_usd;
  const hold = economics.hold_days;
  const kind = kindFor(p.category);
  const action = fillTpl(kind.action, capital, p.name, chain);
  const h = slugHash(p.slug);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const depthOptions: string[] = [];
  if (secondChain !== null) depthOptions.push(`Repeat the core position on ${secondChain} with half the capital.`);
  depthOptions.push(`Add a second, smaller deposit to another main market.`);
  depthOptions.push(`Open the same position in a second pair or market with half the capital.`);
  const depth = depthOptions[h % depthOptions.length]!;
  const weekly = `${kind.weekly} ${WEEKLY_CLOSERS[h % WEEKLY_CLOSERS.length]!}`;
  const first = launched
    ? `Open ${p.name}'s own app from its official site and check the token there — never buy it from a link in a chat or an ad. Use a wallet you hold, or a fresh one funded on ${chain}.`
    : `Set aside a fresh wallet for this farm, fund it on ${chain} with only the capital below plus a ${gasReserve(chain)}, and store its recovery phrase on paper.`;
  const fifth = launched
    ? `Keep the position open at least ${hold} days; collect its fees or yield and check it weekly.`
    : `Hold the position at least ${hold} days and check ${p.name}'s rewards page weekly; claim only through links the protocol itself publishes.`;
  const sixth = launched
    ? `Check ${p.name}'s governance page monthly and vote on one live proposal if you hold a vote.`
    : `Watch for ${kind.signal} ${WATCH_PLACES[h % WATCH_PLACES.length]!} — then check the protocol's own page daily.`;
  const verdictTail =
    economics.verdict === 'FARM'
      ? '.'
      : economics.verdict === 'THIN'
        ? ': worth it only if you are already on the chain.'
        : ': the low end does not pay for the farm.';
  const seventh = launched
    ? `Realised value: this protocol's token already trades${
        p.mcap_usd !== null && p.mcap_usd > 0
          ? ` at a market cap of $${p.mcap_usd.toLocaleString('en-US')}`
          : `, but no market cap is recorded, so the value above is the curve's estimate, not a market price`
      }. At the low end (5% of the value among about ${economics.farmers_est.toLocaleString('en-US')} farmers) farming it before launch would have been worth about $${economics.gross_low_usd.toFixed(0)} gross per farmer, a net of $${economics.net_usd.toFixed(0)} after costs${verdictTail}`
    : `Verdict: ${economics.verdict} — at the low end (5% of the implied value among about ${economics.farmers_est.toLocaleString('en-US')} farmers) this farm expects $${economics.gross_low_usd.toFixed(0)} gross per farmer, a net of $${economics.net_usd.toFixed(0)} after costs${verdictTail}`;
  const exitVerb = launched ? 'when you leave' : 'if the token launches';
  const eighth = `Log the wallet, dates and every transaction hash, and plan the exit now: ${EXIT_LINES[h % EXIT_LINES.length]!} ${exitVerb}, and never pay anyone to claim for you. ${kind.risk}`;
  return [
    { text: first, cost: launched ? 'free to check' : '$4 gas to fund it', time: launched ? '10 min' : '5 min' },
    { text: action, cost: `$${capital} of capital + $8 gas`, time: '15 min to set up' },
    { text: depth, cost: `half the capital again + $3 gas`, time: '10 min' },
    { text: weekly, cost: '$2 gas a week', time: '10 min a week' },
    { text: fifth, cost: `the $${capital} stays locked`, time: `${hold} days` },
    { text: sixth, cost: 'free to watch', time: '5 min a week' },
    { text: seventh, cost: `about $${economics.gas_usd} of gas plus $${economics.opp_cost_usd.toFixed(2)} of opportunity cost`, time: `${hold} days` },
    { text: eighth, cost: '$6 gas to unwind', time: '5 min to log, 15 to unwind' },
  ];
}

/** The board: every protocol in the snapshot, global rank by value, highest first. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = compsOf(snapshot);
  const fit = fitCurve(comps);
  const adjustments = categoryAdjustments(comps, fit, model);
  // The pre-token ranking: every protocol that records no token, launch rank 1..342.
  const pre = snapshot.protocols.filter(isPreToken).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const preScored = pre.map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, adjustments, model);
    return { p, ...v, implied: v.implied, basis: 'implied' as ValueBasis, economics: farmEconomics(p, v.implied, v.age, model) };
  });
  preScored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const launchRank = new Map<string, number>();
  preScored.forEach((s, i) => launchRank.set(s.p.slug, i + 1));
  // The launched reference: every protocol whose token already trades. A recorded market cap
  // is the value; a token with no recorded market cap is priced by the same curve, labelled.
  const launched = snapshot.protocols.filter((p) => !isPreToken(p)).sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const launchedScored = launched.map((p) => {
    if (p.mcap_usd !== null && p.mcap_usd > 0) {
      const v = impliedValue(p, snapshot.as_of, fit, adjustments, model);
      // The spread comes first: v.implied is the curve's estimate, and it must NOT overwrite
      // the recorded market cap, which is the launched row's value.
      return { p, ...v, implied: p.mcap_usd, basis: 'market-cap' as ValueBasis, economics: farmEconomics(p, p.mcap_usd, v.age, model) };
    }
    const v = impliedValue(p, snapshot.as_of, fit, adjustments, model);
    return { p, ...v, implied: v.implied, basis: 'model-estimate' as ValueBasis, economics: farmEconomics(p, v.implied, v.age, model) };
  });
  // The bootstrap band is on the curve base, so it is computed once for every modelled row
  // (all pre-token rows and the launched rows with no market cap) and carried through each
  // row's own growth and maturity multipliers. A recorded market cap carries no band.
  const modelled = [...preScored, ...launchedScored.filter((s) => s.basis === 'model-estimate')].map((s) => s.p);
  const bands = bootstrapBands(modelled, comps);
  const all = [...preScored, ...launchedScored];
  all.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return all.map((s, i) => {
    const isLaunched = s.basis !== 'implied';
    let bandLow = s.implied;
    let bandHigh = s.implied;
    let halfDex = 0;
    if (s.basis !== 'market-cap') {
      const band = bands.get(s.p.slug)!;
      const mult = s.growthMult * s.maturityMult;
      bandLow = Math.max(1, Math.round(band[0] * mult));
      bandHigh = Math.max(bandLow + 1, Math.round(band[1] * mult));
      halfDex = Math.round(((Math.log10(bandHigh) - Math.log10(bandLow)) / 2) * 100) / 100;
    }
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: isLaunched ? ('launched' as const) : ('pre-token' as const),
      value_basis: s.basis,
      launch_rank: isLaunched ? null : launchRank.get(s.p.slug)!,
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        curve_base_usd: Math.round(s.base),
        category_adjustment: round4(s.adjustment),
        growth_pct: round4(s.growthPct),
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_days: s.age,
        band_low_usd: bandLow,
        band_high_usd: bandHigh,
        band_half_dex: halfDex,
      },
      economics: s.economics,
      farm_steps: farmSteps(s.p, s.age, s.economics, isLaunched).map(stepText),
    };
  });
}

/** The name DefiLlama's slug implies: each dash-separated word capitalised, joined with spaces. */
export function deriveName(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const isUpper = (ch: string): boolean => ch >= 'A' && ch <= 'Z';

/**
 * A row's name, compact, for data.js: '' when the name is exactly the slug's implied name,
 * a base-36 case mask when the name differs from it only by letter case (the mask's bit i
 * flips the case of the implied name's i-th letter), and '=' plus the full name otherwise
 * (two rows in this snapshot keep a hyphen inside the name). The page decodes it with the
 * same rule, so the name it shows is the snapshot's own, never a guess.
 */
export function encodeName(slug: string, name: string): string {
  const derived = deriveName(slug);
  if (name === derived) return '';
  if (name.length === derived.length && name.toLowerCase() === derived.toLowerCase()) {
    let mask = 0;
    for (let i = 0; i < name.length; i++) if (isUpper(name[i]!) !== isUpper(derived[i]!)) mask |= 1 << i;
    return mask.toString(36);
  }
  return `=${name}`;
}

/**
 * An integer as base-36, for data.js: a TVL of $13,824,458,555 is ten digits in decimal and
 * seven in base-36, and the value round-trips exactly (every integer here is far below 2^53).
 * The dashboard parses it back with parseInt(x, 36). Only integers are encoded this way;
 * the 7-day change stays a decimal, because it is one.
 */
export function b36(n: number): string {
  return n.toString(36);
}

/** One pre-token board row as its compact `|`-joined line for data.js. */
export function preRow(row: BoardRow, catIndex: Map<string, number>, chainIndex: Map<string, number>): PreRow {
  if (row.slug.includes('|') || row.name.includes('|')) throw new SnapshotError(`row ${row.slug} carries a '|' and cannot be encoded`);
  const chains = row.chains
    .map((c) => {
      const i = chainIndex.get(c);
      if (i === undefined) throw new SnapshotError(`chain ${c} is not in the dictionary`);
      return b36(i);
    })
    .join(',');
  return [
    row.slug,
    encodeName(row.slug, row.name),
    row.category === null ? '' : b36(catIndex.get(row.category)!),
    chains,
    b36(row.tvl_usd),
    row.change_7d === null ? '' : String(Math.round(row.change_7d * 10000) / 10000),
    row.age_days === null ? '' : b36(row.age_days),
    b36(Math.round(row.model.band_half_dex * 100)),
  ].join('|');
}

/** One launched board row as its compact `|`-joined line for data.js. */
export function launchedRow(row: BoardRow, catIndex: Map<string, number>, chainIndex: Map<string, number>): LaunchedRow {
  if (row.slug.includes('|') || row.name.includes('|')) throw new SnapshotError(`row ${row.slug} carries a '|' and cannot be encoded`);
  const shown = row.chains.slice(0, 3);
  const chains =
    shown
      .map((c) => {
        const i = chainIndex.get(c);
        if (i === undefined) throw new SnapshotError(`chain ${c} is not in the dictionary`);
        return b36(i);
      })
      .join(',') + `~${b36(row.chains.length)}`;
  return [
    row.slug,
    encodeName(row.slug, row.name),
    row.category === null ? '' : b36(catIndex.get(row.category)!),
    chains,
    b36(row.tvl_usd),
    row.mcap_usd !== null && row.mcap_usd > 0 ? b36(row.mcap_usd) : '',
    row.change_7d === null ? '' : String(Math.round(row.change_7d * 10000) / 10000),
    row.age_days === null ? '' : b36(row.age_days),
    row.value_basis === 'market-cap' ? '1' : '0',
  ].join('|');
}

/** The audit: how the snapshot splits between pre-token and launched, and the old rule's cut. */
export function auditSnapshot(snapshot: Snapshot): RadarData['audit'] {
  let preToken = 0;
  let oldExcluded = 0;
  let launched = 0;
  let launchedMcap = 0;
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) {
      preToken++;
      if (exclusionReason(p) !== null) oldExcluded++;
    } else {
      launched++;
      if (p.mcap_usd !== null && p.mcap_usd > 0) launchedMcap++;
    }
  }
  return {
    pre_token: preToken,
    ranked_pre: preToken,
    launched,
    launched_mcap: launchedMcap,
    launched_estimated: launched - launchedMcap,
    old_rule_excluded: oldExcluded,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = compsOf(snapshot);
  const fit = fitCurve(comps);
  const adjustments = categoryAdjustments(comps, fit, model);
  const cv = crossValidate(comps, model);
  const baseline = crossValidateBaseline(comps, model);
  const blind = blindTest(comps, model);
  const preRows = board.filter((r) => r.token_status === 'pre-token');
  const launchedRows = board.filter((r) => r.token_status === 'launched');
  const modelled = board.filter((r) => r.value_basis !== 'market-cap').map((r) => snapshot.protocols.find((x) => x.slug === r.slug)!);
  const bands = bootstrapBands(modelled, comps);
  const diagnostics = diagnosticsOf(snapshot, comps, fit, adjustments, bands, board);
  const audit = auditSnapshot(snapshot);
  const verdicts: Record<FarmVerdict, number> = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of preRows) verdicts[r.economics.verdict]++;
  const watchlist = new Set(snapshot.watchlist);
  const watchlistRows: number[] = [];
  preRows.forEach((r, i) => {
    if (watchlist.has(r.slug)) watchlistRows.push(i);
  });
  // Chains and categories are carried as indices into two dictionaries, not as names on
  // every row: the longest chain lists run to dozens of names, and the dictionaries are small.
  // The dictionaries cover the pre-token rows and the launched rows the dashboard shows, and
  // the chain indices run by usage (the most-used chain is 0), so the common chains cost one
  // digit in every row. Launched rows carry only their first three chains plus the total.
  const shownLaunched = launchedRows.slice(0, LAUNCHED_SHOWN);
  const chainUse = new Map<string, number>();
  for (const r of preRows) for (const c of r.chains) chainUse.set(c, (chainUse.get(c) ?? 0) + 1);
  for (const r of shownLaunched) for (const c of r.chains.slice(0, 3)) chainUse.set(c, (chainUse.get(c) ?? 0) + 1);
  const chainNames = [...chainUse.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
  const chainIndex = new Map<string, number>(chainNames.map((c, i) => [c, i]));
  const catNames: string[] = [];
  const catIndex = new Map<string, number>();
  for (const r of [...preRows, ...shownLaunched]) {
    if (r.category !== null && !catIndex.has(r.category)) {
      catIndex.set(r.category, catNames.length);
      catNames.push(r.category);
    }
  }
  // Richest adjustment first: the page shows the multiples in this order, so it needs no sort.
  catNames.sort((a, b) => (adjustments[b] ?? 0) - (adjustments[a] ?? 0));
  catIndex.clear();
  catNames.forEach((c, i) => catIndex.set(c, i));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source.replace(/, fetched .*$/, ''),
    model_version: MODEL_VERSION,
    // The fit and the category adjustments are serialised at full precision, unrounded: the
    // page recomputes every implied value from them, and a rounded fit would move the page's
    // dollars away from board.json's. Only the display-only numbers (r2, backtest, diagnostics)
    // are rounded, and the page shows those rounded too.
    fit: { intercept: fit.intercept, slope: fit.slope, r2: round4(fit.r2), n_comps: fit.n_comps },
    backtest: {
      cv_median_abs_log10: round4(cv.median_abs_log10),
      cv_within_2x: Math.round(cv.within_2x * 1000) / 1000,
      cv_n: cv.n,
      baseline_cv_median_abs_log10: round4(baseline.median_abs_log10),
      blind_median_ratio: round4(blind.median_ratio),
      blind_within_2x: Math.round(blind.within_2x * 1000) / 1000,
      blind_n: blind.n,
      blind_cutoff: blind.cutoff,
    },
    diagnostics,
    audit,
    verdicts,
    watchlist_rows: watchlistRows,
    cat_adjustments: catNames.map((c) => adjustments[c] ?? 0),
    anchors: anchorRows(comps).slice(0, 8),
    chain_names: chainNames,
    cat_names: catNames,
    rows: preRows.map((r) => preRow(r, catIndex, chainIndex)).join('\n'),
    launched: shownLaunched.map((r) => launchedRow(r, catIndex, chainIndex)).join('\n'),
    launched_shown: shownLaunched.length,
    launched_total: launchedRows.length,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return `the board repeats a slug`;
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value above the gate cap`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
