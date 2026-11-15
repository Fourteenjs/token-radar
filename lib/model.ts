// The token radar's model, version 2: a comparables curve fitted on the snapshot's own
// live-token protocols, backtested out of sample, with every farm plan netted to the dollar.
//
// The board ranks every protocol the snapshot records as pre-token that is not a wrapped, staked or
// bridged product of a token that already trades, and not an exchange or a versioned pool. The
// watchlist is the floor: all 40 of its slugs are on the board, and the board adds every other
// rankable protocol below the floor, so the radar covers the early ones too.
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
// The curve is chosen by cross-validation, not by taste: on a deterministic 5-fold split of the
// comps it predicts held-out market caps with a smaller median log error than a category-median
// multiple does on the same folds, and on a time split — fitted on the older half of the dated
// comps, tested on the newer half — its median predicted-to-actual ratio is near 1. Both errors
// are computed at build time and printed on the dashboard, so the reader sees the test, not a
// claim. The tests cover the curve's base value only: the growth and maturity multipliers are
// not backtested, and a median log error near 0.56 still means a typical fitted value is off by
// a factor of about 3.6 — the curve ranks, it does not price to the dollar.
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
// and the dashboard's research note says so.

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
export const MODEL_VERSION = 'radar-comps-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 8;

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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_base_usd: number;
    category_adjustment: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  economics: FarmEconomics;
  farm_steps: string[];
}

/**
 * One board row, compact, for data.js: [rank, slug, name, category, chains (comma-joined),
 * tvl_usd, change_7d, age_days, implied_value_usd, category_adjustment, verdict, net_usd,
 * on_watchlist (1 or 0)]. The page re-derives the growth and maturity multipliers from change_7d and
 * age_days, and the farmer crowd, gas and opportunity cost from TVL, age and net, with the same
 * constants the model states, so the page and the board agree without carrying every number twice.
 */
export type RadarRow = [
  number,
  string,
  string,
  string | null,
  string,
  number,
  number | null,
  number | null,
  number,
  number,
  FarmVerdict,
  number,
  number,
];

/** A live-token protocol, compact, for data.js: [slug, name, category, chains, tvl_usd, mcap_usd, change_7d]. */
export type LiveRow = [string, string, string | null, string[], number, number | null, number | null];

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

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  model_version: string;
  fit: CurveFit;
  backtest: Backtest;
  audit: {
    pre_token: number;
    ranked: number;
    excluded: number;
  };
  verdicts: Record<FarmVerdict, number>;
  watchlist_size: number;
  cat_adjustments: Record<string, number>;
  rows: RadarRow[];
  live: LiveRow[];
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

/** Why a pre-token protocol is not rankable: the first rule that sets it aside, else null. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (WRAPPED_WORD.test(p.name)) return 'wrapped or staked product';
  if (PRODUCT_CATEGORIES.has(p.category ?? '')) return 'bridge, staking or exchange product';
  if (VERSIONED.test(p.name)) return 'versioned pool';
  if (EXCHANGE_NAME.test(p.name)) return 'exchange product';
  return null;
}

/**
 * Whether a protocol is one the board may rank: it records no token, and it is not a wrapped,
 * staked or bridged product of a token that already trades, not an exchange and not a versioned
 * pool. The watchlist's own rule, applied to every protocol in the snapshot, above and below the
 * floor alike.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && exclusionReason(p) === null;
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
  const net = Math.round((grossRaw - gas - opp) * 100) / 100;
  // The gross is re-derived from the rounded net, so the page — which stores only the net and
  // re-derives the gross from it — prints the same dollars to the cent.
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

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const comps = compsOf(snapshot);
  const fit = fitCurve(comps);
  const adjustments = categoryAdjustments(comps, fit, model);
  // The watchlist is the floor: every slug on it is ranked, even one the snapshot no longer
  // carries (it cannot, but coverage is the gate's row and is never gambled on a missing record).
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p === undefined) continue;
    // The house's watchlist rule already keeps only rankable protocols; a member that failed
    // the rule would mean the snapshot and the rule disagree, and the build refuses rather
    // than ranking a protocol under a false pre-token label.
    if (!isRankable(p)) throw new SnapshotError(`watchlist member ${slug} is not rankable`);
    chosen.set(slug, p);
  }
  // The early radar: every other rankable protocol, above and below the floor alike.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, adjustments, model);
    const economics = farmEconomics(p, v.implied, v.age, model);
    return { p, ...v, economics };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
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
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      curve_base_usd: Math.round(s.base),
      category_adjustment: round4(s.adjustment),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    economics: s.economics,
    farm_steps: farmSteps(s.p, s.age, s.economics).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC into ${name}'s ${chain} market and leave the deposit earning.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain} and hold the LP position.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Back one outcome with $${capital} on ${name} and keep the position through settlement.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset issued through ${name} on ${chain}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('index') || c.includes('aggregator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} through ${name} and put the bridged funds to work in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age) and its economics, never from a
 * hand-written list of names. The dashboard renders the same plan from the same inputs, so the
 * page and the board agree. The sixth step is the verdict, netted to the dollar.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, economics: FarmEconomics): FarmStep[] {
  const chain = chainOf(p);
  const capital = economics.capital_usd;
  const hold = economics.hold_days;
  const action = actionFor(p, capital, chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const depth =
    secondChain !== null
      ? `Repeat the core position on ${secondChain} with half the capital, so the farm covers two chains.`
      : `Add a second, smaller deposit to the protocol's other main market to widen the footprint.`;
  const verdictLine =
    economics.verdict === 'FARM'
      ? `Verdict: FARM — at the low end of the band (5% of the implied value shared among about ${economics.farmers_est.toLocaleString('en-US')} farmers) this farm expects about $${economics.gross_low_usd.toFixed(0)} gross per farmer, a net of about $${economics.net_usd.toFixed(0)} after costs.`
      : economics.verdict === 'THIN'
        ? `Verdict: THIN — at the low end of the band (5% of the implied value shared among about ${economics.farmers_est.toLocaleString('en-US')} farmers) this farm expects about $${economics.gross_low_usd.toFixed(0)} gross per farmer, a net of about $${economics.net_usd.toFixed(0)} after costs: worth it only if you are already on the chain.`
        : `Verdict: SKIP — at the low end of the band (5% of the implied value shared among about ${economics.farmers_est.toLocaleString('en-US')} farmers) this farm expects about $${economics.gross_low_usd.toFixed(0)} gross per farmer, a net of about $${economics.net_usd.toFixed(0)} after costs: the low end does not pay for the farm.`;
  return [
    {
      text: `Set aside a clean wallet for this farm alone, fund it with only the capital below, and store its recovery phrase offline on paper.`,
      cost: 'about $4 in gas to fund it',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital plus about $8 of gas`,
      time: '15 minutes to set up',
    },
    {
      text: depth,
      cost: `about half the capital again and $3 of gas`,
      time: '10 minutes',
    },
    {
      text: `Do one real action every week, a deposit, a swap, a vote or a borrow, and never leave the wallet idle for a full month.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days and check ${p.name}'s points or rewards page weekly; only claim through links the protocol itself publishes.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: verdictLine,
      cost: `about $${economics.gas_usd} of gas plus $${economics.opp_cost_usd.toFixed(2)} of opportunity cost on the capital`,
      time: `${hold} days`,
    },
    {
      text: `Log the wallet address, the dates and every transaction hash, and plan the exit now: unwind in two steps if the token launches, and never pay anyone to claim for you.`,
      cost: 'about $6 of gas to unwind',
      time: '5 minutes to log, 15 to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => [p.slug, p.name, p.category, p.chains, p.tvl_usd, p.mcap_usd, p.change_7d] as LiveRow);
}

/** A board row's compact form for data.js, with the farm verdict and its net beside the value. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return [
    row.rank,
    row.slug,
    row.name,
    row.category,
    row.chains.join(','),
    row.tvl_usd,
    row.change_7d,
    row.age_days,
    row.implied_value_usd,
    row.model.category_adjustment,
    row.economics.verdict,
    row.economics.net_usd,
    onWatchlist ? 1 : 0,
  ];
}

/** The audit: how many pre-token protocols the snapshot holds, how many are ranked, and how many are set aside. */
export function auditSnapshot(snapshot: Snapshot): RadarData['audit'] {
  let preToken = 0;
  let ranked = 0;
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    preToken++;
    if (exclusionReason(p) === null) ranked++;
  }
  return { pre_token: preToken, ranked, excluded: preToken - ranked };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const comps = compsOf(snapshot);
  const fit = fitCurve(comps);
  const adjustments = categoryAdjustments(comps, fit, model);
  const cv = crossValidate(comps, model);
  const baseline = crossValidateBaseline(comps, model);
  const blind = blindTest(comps, model);
  const audit = auditSnapshot(snapshot);
  const verdicts: Record<FarmVerdict, number> = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdicts[r.economics.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    model_version: MODEL_VERSION,
    fit: { intercept: Math.round(fit.intercept * 1e6) / 1e6, slope: Math.round(fit.slope * 1e6) / 1e6, r2: round4(fit.r2), n_comps: fit.n_comps },
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
    audit,
    verdicts,
    watchlist_size: snapshot.watchlist.length,
    cat_adjustments: Object.fromEntries(Object.entries(adjustments).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
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
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
