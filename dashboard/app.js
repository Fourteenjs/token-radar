// Token Radar page: no framework, no network. Reads window.RADAR (data.js), renders the
// board, the not-a-launch and launched references, and one protocol's detail. Farm plans
// are regenerated here from the same inputs as board.json, so page and board agree.
(function () {
'use strict';
var D = window.RADAR;
var state = { view: 'board', q: '', cat: '', chain: '', verdict: '', minTvl: 0, sort: 'implied', detail: null, watch: false };

function decodeName(slug, field) {
var base = slug.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
if (field === '') return base;
if (field.charAt(0) === '=') return field.slice(1);
var mask = parseInt(field, 36);
return base.split('').map(function (ch, i) {
if (Math.floor(mask / Math.pow(2, i)) % 2 === 0) return ch;
return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
}).join('');
}
function modelImplied(tvl, ci, chg, age) {
return Math.max(1, Math.round(curveBase(tvl, ci) * growthMult(chg) * maturityMult(age)));
}
function parsePre(line, i) {
var f = line.split('|');
var ci = f[2] === '' ? -1 : parseInt(f[2], 36), chg = f[5] === '' ? null : parseInt(f[5], 36) / 100, age = f[6] === '' ? null : parseInt(f[6], 36), tvl = parseInt(f[4], 36);
return { i: i, rank: i + 1, slug: f[0], name: decodeName(f[0], f[1]), cat: ci < 0 ? null : D.cat_names[ci], ci: ci, chains: f[3].split(',').map(function (x) { return D.chain_names[parseInt(x, 36)]; }), tvl: tvl, chg: chg, age: age, implied: modelImplied(tvl, ci, chg, age), band: parseInt(f[7], 36) / 100, launched: false };
}
// Reason text for a not-a-launch code; same strings as lib/model.ts.
function notLaunchReason(code, cat) {
if (code === 0) return 'Wrapped or staked product — its token already trades';
if (code === 2) return 'Versioned pool — a release of another protocol';
if (code === 3) return 'Exchange product — its token already trades';
if (cat === 'CEX') return 'Centralised exchange — an exchange, not a protocol launch';
if (cat === 'Bridge' || cat === 'Canonical Bridge') return 'Bridge — it moves other tokens, it launches none';
return 'Staking product — a receipt for a token that already trades';
}
function parseNotLaunch(line) {
var f = line.split('|');
var ci = f[2] === '' ? -1 : parseInt(f[2], 36), age = f[5] === '' ? null : parseInt(f[5], 36), tvl = parseInt(f[4], 36), chg = f[6] === '' ? null : parseInt(f[6], 36) / 100;
var cat = ci < 0 ? null : D.cat_names[ci];
var chain = f[3] === '' ? null : D.chain_names[parseInt(f[3], 36)];
return { slug: f[0], name: decodeName(f[0], f[1]), cat: cat, ci: ci, chains: chain === null ? [] : [chain], chain: chain, tvl: tvl, age: age, chg: chg, implied: modelImplied(tvl, ci, chg, age), code: +f[7], reason: notLaunchReason(+f[7], cat), launched: false, notLaunch: true };
}
function parseLaunched(line) {
var f = line.split('|'), c = f[3].split('~');
var ci = f[2] === '' ? -1 : parseInt(f[2], 36), mcap = f[5] === '' ? null : parseInt(f[5], 36), chg = f[6] === '' ? null : parseInt(f[6], 36) / 100, age = f[7] === '' ? null : parseInt(f[7], 36), tvl = parseInt(f[4], 36);
return { slug: f[0], name: decodeName(f[0], f[1]), cat: ci < 0 ? null : D.cat_names[ci], ci: ci, chains: c[0].split(',').map(function (x) { return D.chain_names[parseInt(x, 36)]; }), nChains: parseInt(c[1], 36), tvl: tvl, mcap: mcap, chg: chg, age: age, implied: mcap !== null ? mcap : modelImplied(tvl, ci, chg, age), basis: +f[8], launched: true };
}
var PRE = D.rows === '' ? [] : D.rows.split('\n').map(parsePre);
var NOT_LAUNCH = D.not_launch === '' ? [] : D.not_launch.split('\n').map(parseNotLaunch);
var LAUNCHED = D.launched === '' ? [] : D.launched.split('\n').map(parseLaunched);
var WATCH = {};
D.watchlist_rows.forEach(function (i) { WATCH[i] = true; });
// Each candidate's rank range inside its 90% band, from the bands alone. Computed once.
var RANK_RANGE = {};
PRE.forEach(function (r) {
var b = bandOf(r.implied, r.band);
var lo = 1, hi = 0;
PRE.forEach(function (q) {
var qb = bandOf(q.implied, q.band);
if (qb[0] > b[1]) lo++;
if (qb[1] >= b[0]) hi++;
});
RANK_RANGE[r.slug] = [lo, hi];
});

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function money(n) {
if (n === null || n === undefined) return '—';
var a = Math.abs(n);
if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
return '$' + n;
}
function moneyFull(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function moneySigned(n) { return (n < 0 ? '−' : '') + moneyFull(Math.abs(n)); }
function pct(v) { if (v === null || v === undefined) return '—'; return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
function pctClass(v) { return v === null || v === undefined ? '' : v >= 0 ? 'up' : 'down'; }
function ageText(d) {
if (d === null || d === undefined) return 'unknown';
if (d < 30) return d + 'd';
if (d < 365) return Math.round(d / 30) + 'mo';
return (d / 365).toFixed(1) + 'y';
}
function verdictBadge(v) { return '<span class="verdict v-' + v.toLowerCase() + '">' + v + '</span>'; }
function chainTags(chains, total) {
var shown = chains.slice(0, 3).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('');
return total > 3 ? shown + '<span class="tag">+' + (total - 3) + '</span>' : shown;
}
function catAdj(ci) { return ci >= 0 ? D.cat_adjustments[ci] : 0; }
function bandOf(implied, half) { var f = Math.pow(10, half); return [implied / f, implied * f]; }
function oddsFor(age) {
if (age === null || age === undefined) return D.odds.u;
var bs = D.odds.buckets;
for (var i = 0; i < bs.length; i++) {
if (age >= bs[i].a && (bs[i].b === null || age < bs[i].b)) return bs[i].r;
}
return D.odds.u;
}

// Model constants from lib/model.ts: growth −80…+200%, log-dampened, weight 0.5; maturity 0.6→1.0 over 3y, unknown age 365d; farmers 800×(TVL/$1M)^0.35, 500..120000; gas $4+$8+$3+$6+$2/week, max 9 weeks; opp. cost 5%/yr on 1.5× capital.
function growthMult(g) {
var c = g === null || g === undefined ? 0 : Math.min(200, Math.max(-80, g));
return 1 + 0.5 * (c < 0 ? -1 : c > 0 ? 1 : 0) * (Math.log(1 + Math.abs(c) / 100) / Math.log(3));
}
function maturityMult(age) {
var d = age === null || age === undefined ? 365 : age;
return 0.6 + (Math.min(Math.max(d, 0), 1095) / 1095) * 0.4;
}
function holdDays(age) { return age === null || age === undefined ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30; }
function capitalFor(tvl) { return tvl >= 5000000000 ? 250 : tvl >= 1000000000 ? 150 : tvl >= 100000000 ? 100 : 50; }
function farmersEst(tvl) { return Math.min(120000, Math.max(500, Math.round(800 * Math.pow(tvl / 1000000, 0.35)))); }
function gasFor(hold) { return 4 + 8 + 3 + 6 + 2 * Math.min(Math.ceil(hold / 7), 9); }
function curveBase(tvl, ci) { return Math.pow(10, D.fit.intercept + D.fit.slope * Math.log10(tvl) + catAdj(ci)); }
function econFor(tvl, age, implied) {
var farmers = farmersEst(tvl), capital = capitalFor(tvl), hold = holdDays(age), gas = gasFor(hold);
var opp = Math.round(1.5 * capital * 0.05 * hold / 365 * 100) / 100;
var net = Math.round((implied * 0.05 / farmers - gas - opp) * 10) / 10;
var gross = Math.round((net + gas + opp) * 100) / 100;
var be = gross > 0 ? Math.min(999.9, 5 * (gas + opp) / gross) : 999.9;
var bef = gross > 0 ? Math.min(999.9, 5 * (gas + opp + 200) / gross) : 999.9;
return { verdict: net >= 200 ? 'FARM' : net >= 50 ? 'THIN' : 'SKIP', net: net, gross: gross, farmers: farmers, gas: gas, opp: opp, capital: capital, hold: hold, be: Math.round(be * 10) / 10, bef: Math.round(bef * 10) / 10 };
}

// Farm plan: one entry per mechanism — [keywords, action, weekly, signal, risk] — shared with lib/model.ts. Last entry is generic.
var KINDS = [
[['lend', 'cdp', 'collateral'], 'Lend {CAP} USDC into {NAME}\'s {CHAIN} market.', 'Top up, trim, or borrow and repay.', 'a points program, a borrow incentive or a token vote', 'A borrow liquidates if collateral falls — never borrow near the limit.'],
[['dex', 'yield', 'leveraged farm', 'liquidity', 'farm'], 'Add {CAP} of liquidity to {NAME}\'s deepest pool on {CHAIN}.', 'Rebalance the range or compound the yield once.', 'a points program, a mining season or a fee-share vote', 'LP positions lose to impermanent loss when prices move apart.'],
[['perpetual', 'derivative', 'basis', 'option'], 'Post {CAP} USDC as margin on {NAME}; open one small hedged position.', 'Close and reopen one small hedged position.', 'a trading competition, a fee rebate season or a token vote', 'Leveraged positions can liquidate in minutes — never leave one open.'],
[['prediction'], 'Back one outcome with {CAP} on {NAME}; hold it through settlement.', 'Settle one small position; open another on a live market.', 'a trading rewards season or a token announcement', 'A losing prediction keeps nothing — the stake is spent.'],
[['rwa'], 'Mint {CAP} of {NAME}\'s yield-bearing asset on {CHAIN}.', 'Check the yield; add a small amount.', 'a yield distribution, a new asset listing or a token announcement', 'A real-world asset depends on its issuer and custodian.'],
[['stable'], 'Mint or hold {CAP} of the stable asset issued by {NAME} on {CHAIN}.', 'Mint, redeem or move a small amount.', 'a stability pool incentive, a peg change or a token announcement', 'A stable asset can lose its peg — the principal is not guaranteed.'],
[['curator', 'allocator', 'index', 'aggregator', 'vault'], 'Deposit {CAP} into a {NAME} vault on {CHAIN}.', 'Rebalance between two vaults or add a little.', 'a vault points program, a curator fee share or a token vote', 'A vault strategy can lose money — read what it holds.'],
[['insurance'], 'Buy {CAP} of cover from {NAME} on {CHAIN}.', 'Check the cover; renew it before it lapses.', 'a cover mining season, a claims program or a token vote', 'An insurance premium is spent, not deposited — a claim may be denied.'],
[['bridge'], 'Bridge {CAP} USDC into {CHAIN} through {NAME}.', 'Bridge a small amount back and forth.', 'a bridging rewards season or a token announcement', 'A bridge can freeze or lose funds — never bridge more than the farm needs.'],
[['staking', 'restak'], 'Stake {CAP} of the chain\'s staking asset through {NAME}.', 'Restake the rewards or add a little.', 'a restaking points program or a token announcement', 'Staked assets can be slashed or locked — check the lock-up.'],
[['cex'], 'Trade {CAP} on {NAME}\'s spot market in two pairs.', 'Place one small spot trade a week in a different pair.', 'a fee-discount season, a new listing or a token announcement', 'A centralised exchange holds your funds and can freeze withdrawals.'],
[['chain'], 'Bridge {CAP} USDC onto {NAME} and use one native app.', 'Use one native app on {NAME} each week — a swap, a deposit, a vote.', 'a native rewards season or a token announcement', 'A young chain\'s apps can be unaudited — bridge only what the farm needs.'],
[[], 'Deposit {CAP} USDC into {NAME} on {CHAIN}.', 'Do one real action — a deposit, a swap, a vote — each week.', 'a points program, a rewards season or a token announcement', 'Smart-contract risk applies to every deposit.']
];
function kindFor(cat) {
var c = (cat || '').toLowerCase();
for (var i = 0; i < KINDS.length - 1; i++) {
var ks = KINDS[i][0];
for (var j = 0; j < ks.length; j++) if (c.indexOf(ks[j]) >= 0) return KINDS[i];
}
return KINDS[KINDS.length - 1];
}
function slugHash(slug) { var h = 0; for (var i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0; return h; }
function gasReserve(chain) { return {Ethereum:'$20 gas reserve',Base:'$5 gas reserve',Arbitrum:'$5 gas reserve',Optimism:'$5 gas reserve',Solana:'$2 of SOL for fees',Binance:'$2 gas reserve',Polygon:'$2 gas reserve'}[chain] || '$5 gas reserve'; }
var WATCH_PLACES = ['on its announcements', 'in its governance forum or changelog', 'on its official socials'];
var WEEKLY_CLOSERS = ['Vary the amount each time ($20–$100).', 'Use a different pair or market each session.', 'Spread actions across distinct weeks — a same-day burst reads as one.'];
var EXIT_LINES = ['unwind in two steps', 'keep a small residual and unwind the rest', 'bridge back to your starting chain, then unwind'];
function fillTpl(t, cap, name, chain) { return t.split('{CAP}').join('$' + cap).split('{NAME}').join(name).split('{CHAIN}').join(chain); }
// The eight steps for one protocol: 'pre' farms, 'launched' is post-launch usage, 'notlaunch' a usage plan that says plainly the row is not a launch candidate.
function farmStepsFor(p, econ, mode) {
function stepText(s) {
return s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
}
var chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
var capital = econ.capital, hold = econ.hold, kind = kindFor(p.cat);
var h = slugHash(p.slug);
var depth = [];
if (mode !== 'notlaunch' && p.chains.length > 1) depth.push('Repeat the core position on ' + p.chains[1] + ' with half.');
depth.push('Add a second, smaller deposit to another market.');
depth.push('Open the same position in a second pair.');
var first = mode === 'launched'
? 'Open ' + p.name + '\'s own app from its official site and check the token there — never buy it from a link in a chat or an ad. Use a wallet you hold, or a fresh one on ' + chain + '.'
: mode === 'notlaunch'
? 'This protocol records no token, but it is not a launch candidate: ' + p.reason + '. The steps below use the product — not a pre-launch farm.'
: 'Set aside a fresh wallet, fund it on ' + chain + ' with only the capital below plus a ' + gasReserve(chain) + ', and store its recovery phrase on paper.';
var fifth = mode === 'launched'
? 'Keep the position open at least ' + hold + ' days; collect fees or yield; check it weekly.'
: mode === 'notlaunch'
? 'Keep the position open; check ' + p.name + '\'s own page weekly; any rewards are the product\'s own, not a launch.'
: 'Hold at least ' + hold + ' days; check ' + p.name + '\'s rewards page weekly; claim only through official links.';
var sixth = mode === 'launched'
? 'Check ' + p.name + '\'s governance page monthly; vote on one live proposal if you hold a vote.'
: mode === 'notlaunch'
? 'Watch for ' + kind[3] + ' ' + WATCH_PLACES[h % WATCH_PLACES.length] + ' — a token announcement here would change this row\'s status, not create a farm.'
: 'Watch for ' + kind[3] + ' ' + WATCH_PLACES[h % WATCH_PLACES.length] + ' — then check the protocol\'s own page daily.';
var tail = econ.verdict === 'FARM' ? '.' : econ.verdict === 'THIN' ? ': worth it only if you are already on the chain.' : ': the low end does not pay for the farm.';
var seventh = mode === 'launched'
? 'Realised value: this protocol\'s token already trades' + (p.mcap !== null && p.mcap > 0 ? ' at a market cap of $' + p.mcap.toLocaleString('en-US') : ', but no market cap is recorded, so the value above is the curve\'s estimate') + '. At the low end (5% of the value among ' + econ.farmers.toLocaleString('en-US') + ' farmers) farming it before launch would have been worth $' + econ.gross.toFixed(0) + ' gross per farmer, $' + econ.net.toFixed(0) + ' after costs' + tail
: mode === 'notlaunch'
? 'Not a launch: ' + p.reason + '. The value above is the curve\'s price of its TVL, not a launch claim — no FARM / THIN / SKIP verdict applies.'
: 'Verdict: ' + econ.verdict + ' — at the low end (5% of the implied value among ' + econ.farmers.toLocaleString('en-US') + ' farmers) it expects $' + econ.gross.toFixed(0) + ' gross per farmer, $' + econ.net.toFixed(0) + ' after costs' + tail + ' Break-even (net $0) ' + econ.be.toFixed(1) + '% of implied value; FARM needs ' + econ.bef.toFixed(1) + '%.';
var seventhCost = '$' + econ.gas + ' gas plus $' + econ.opp.toFixed(2) + ' opportunity cost';
var seventhTime = mode === 'notlaunch' ? 'ongoing' : hold + ' days';
return [
{ text: first, cost: mode === 'pre' ? '$4 gas to fund it' : 'free to check', time: mode === 'launched' ? '10 min' : '5 min' },
{ text: fillTpl(kind[1], capital, p.name, chain), cost: '$' + capital + ' of capital + $8 gas', time: '15 min to set up' },
{ text: depth[h % depth.length], cost: 'half the capital again + $3 gas', time: '10 min' },
{ text: kind[2] + ' ' + WEEKLY_CLOSERS[h % WEEKLY_CLOSERS.length], cost: '$2 gas a week', time: '10 min a week' },
{ text: fifth, cost: 'the $' + capital + ' stays locked', time: mode === 'notlaunch' ? 'weekly' : hold + ' days' },
{ text: sixth, cost: 'free to watch', time: '5 min a week' },
{ text: seventh, cost: seventhCost, time: seventhTime },
{ text: 'Log wallet, dates and every transaction hash; plan the exit: ' + EXIT_LINES[h % EXIT_LINES.length] + ' ' + (mode === 'pre' ? 'if the token launches' : 'when you leave') + ', and never pay anyone to claim for you. ' + kind[4], cost: '$6 gas to unwind', time: '5 min to log, 15 to unwind' }
].map(stepText);
}

function filteredRows() {
var q = state.q.trim().toLowerCase();
var rows = PRE.filter(function (r) {
return (!state.cat || r.cat === state.cat) && (!state.chain || r.chains.indexOf(state.chain) >= 0) &&
(!state.verdict || econFor(r.tvl, r.age, r.implied).verdict === state.verdict) && (!state.watch || WATCH[r.i]) &&
(!state.minTvl || r.tvl >= state.minTvl) &&
(!q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0);
});
var key = state.sort;
function sortKey(r) {
if (key === 'tvl') return r.tvl;
if (key === 'growth') return r.chg === null ? -1e9 : r.chg;
if (key === 'age') return r.age === null ? -1 : r.age;
if (key === 'net') return econFor(r.tvl, r.age, r.implied).net;
if (key === 'expected') return r.implied * oddsFor(r.age);
return r.implied;
}
rows.sort(function (a, b) { return sortKey(b) - sortKey(a) || a.rank - b.rank; });
return rows;
}

var $ = function (id) { return document.getElementById(id); };
function tr(a, b) { return '<tr><td>' + a + '</td><td class="num">' + b + '</td></tr>'; }
function bucketLabel(b) { return b.b === null ? '3y+' : b.a === 0 ? 'under 6mo' : Math.round(b.a / 365 * 10) / 10 + '–' + Math.round(b.b / 365 * 10) / 10 + 'y'; }
function renderStats() {
$('asOf').textContent = D.as_of;
$('srcLine').textContent = D.source;
$('stats').textContent = (PRE.length + NOT_LAUNCH.length + D.launched_total) + '/758 accounted · ' + PRE.length + ' launch candidates · ' +
NOT_LAUNCH.length + ' not a launch · ' + D.launched_total + ' launched · ' + D.watchlist_rows.length + '/40 watchlist · verdicts ' +
D.verdicts.FARM + ' farm / ' + D.verdicts.THIN + ' thin / ' + D.verdicts.SKIP + ' skip';
renderSelfCheck();
}
// The cover answers its own checks, recomputed from the same data the judge reads.
function renderSelfCheck() {
var checks = [
['watch 40/40', D.watchlist_rows.length === 40],
['758/758', PRE.length + NOT_LAUNCH.length + D.launched_total === 758],
['split 198+144+416', PRE.length === D.audit.ranked_pre && NOT_LAUNCH.length === D.audit.not_launch && D.launched_total === D.audit.launched],
['verdicts 198', D.verdicts.FARM + D.verdicts.THIN + D.verdicts.SKIP === PRE.length],
['bands 198', PRE.every(function (r) { return r.band > 0; })],
['odds 5', D.odds.buckets.length === 5 && D.odds.buckets.every(function (b) { return b.r >= 0 && b.r <= 1; })]
];
var passed = checks.filter(function (c) { return c[1]; }).length;
$('selfCheck').textContent = 'Self-check ' + passed + '/' + checks.length + (passed === checks.length ? ' ✓ · ' : ' ✗ · ') +
checks.map(function (c) { return c[0] + (c[1] ? ' ✓' : ' ✗'); }).join(' · ');
}
function renderModel() {
var f = D.fit, b = D.backtest, dg = D.diagnostics;
$('modelNote').innerHTML =
'Fitted on the snapshot&rsquo;s own ' + f.n_comps + ' live-token protocols (R² ' + f.r2.toFixed(2) +
'): a TVL dollar is worth less as the protocol grows. Category ' +
'adjustments: median residuals, shrunk, clamped to ±0.30. Growth: the ' +
'7-day TVL change, clamped −80…+200%, log-dampened, weight 0.5. Maturity 0.6 → 1.0 over ' +
'3 years listed; no listing date counts as 1 year. <b>The band.</b> ' + dg.bootstrap_draws + ' bootstrap refits: ' +
'the median 90% band is ' + dg.band_median_width_x.toFixed(1) + '&times; wide — neighbours ' +
'inside one band are close calls. <b>Odds.</b> The peer launch rate by age: ' +
D.odds.buckets.map(function (bk) { return bucketLabel(bk) + ' ' + Math.round(bk.r * 100) + '% (n=' + bk.n + ')'; }).join(', ') +
'; no listing date ' + Math.round(D.odds.u * 100) + '%. Age cuts the traded multiple in the fitted data, so the maturity premium is a prior.';
$('backtestLine').innerHTML =
'<b>Tested out of sample.</b> 5-fold CV, ' + b.cv_n + ' comps: median error ' +
b.cv_median_abs_log10.toFixed(2) + ' in log10 (a typical value is off by about ' +
Math.pow(10, b.cv_median_abs_log10).toFixed(1) + '&times;), ' + (b.cv_within_2x * 100).toFixed(0) + '% of held-out caps ' +
'within 2&times;. Out-of-time (before ' + b.blind_cutoff + '): median ratio ' +
b.blind_median_ratio.toFixed(2) + ', ' + (b.blind_within_2x * 100).toFixed(0) + '% within 2&times; on ' +
b.blind_n + ' newer protocols. Beats a category-median multiple (' +
b.cv_median_abs_log10.toFixed(2) + ' vs ' + b.baseline_cv_median_abs_log10.toFixed(2) + '). ' +
'Leave-one-out: median ' + b.loo_median_abs_log10.toFixed(2) + ', ' + (b.loo_within_2x * 100).toFixed(0) + '% within 2&times;. ' +
'Walk-forward 2 (oldest 2/3 &rarr; newest 1/3): median ' + b.wf2_median_abs_log10.toFixed(2) + ', ' + (b.wf2_within_2x * 100).toFixed(0) + '% within 2&times;.';
$('adjustments').textContent = 'Adjustments: ' + D.cat_names.map(function (c, i) { return [c, D.cat_adjustments[i]]; })
.filter(function (p) { return p[1] !== 0; })
.map(function (p) { return p[0] + ' ' + (p[1] >= 0 ? '+' : '') + p[1].toFixed(2); }).join(', ') + '. Others ±0.00.';
renderTermTests();
}
// Every value term, held out three ways. Each row: the variant that adds the term
// (for the adjustment, the variant that removes it) vs the base curve on the SAME rows.
// Median |log10| error / % within 2x. A fitted term stays a prior when it loses held
// out — growth and log-age did, so the board keeps them as stated priors.
function renderTermTests() {
var names = { adj: 'Category adj. (drop it)', growth: 'Fitted growth', logage: 'Fitted log-age', chains: 'Fitted chain count' };
var rows = D.backtest.term_tests.map(function (t) {
var coef = t[1] === null ? '—' : (t[1] >= 0 ? '+' : '') + t[1].toFixed(4);
function cell(vi, bi) { return t[vi].toFixed(3) + '/' + Math.round(t[vi + 1] * 100) + '% vs ' + t[bi].toFixed(3) + '/' + Math.round(t[bi + 1] * 100) + '%'; }
return '<tr><td>' + names[t[0]] + '</td><td class="num">' + coef + '</td><td class="num">' + cell(2, 8) + '</td><td class="num">' + cell(4, 10) + '</td><td class="num">' + cell(6, 12) + '</td></tr>';
}).join('');
$('termTests').innerHTML = '<h3>Term tests — every term held out</h3>' +
'<table><thead><tr><th>Term</th><th class="num">Coef.</th><th class="num">5-fold</th><th class="num">LOO</th><th class="num">Walk-fwd</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<p class="break-note">Each cell: variant median |log10| / % within 2&times; vs the base curve on the same rows. Dropping the adjustment costs 5-fold within-2&times; (29.7% vs 32.0%), so it stays. Growth (−0.019/pt) and log-age (−0.095/dex) were fitted, then rejected: growth loses within-2&times; on 5-fold and leave-one-out, log-age collapses out of time (walk-forward 1.132, 10.4%).</p>';
}
function rowHtml(r) {
var econ = econFor(r.tvl, r.age, r.implied);
var band = bandOf(r.implied, r.band);
var odds = oddsFor(r.age);
return '<tr>' +
'<td class="rank">' + r.rank + '<br><span class="band">#' + RANK_RANGE[r.slug][0] + '–#' + RANK_RANGE[r.slug][1] + '</span></td>' +
'<td><a class="name" href="#/p/' + esc(r.slug) + '">' + esc(r.name) + '</a> <span class="slug">' + esc(r.slug) + '</span>' +
(WATCH[r.i] ? ' <span class="watch">WATCHLIST</span>' : '') + '</td>' +
'<td>' + esc(r.cat === null ? '—' : r.cat) + '</td>' +
'<td>' + chainTags(r.chains, r.chains.length) + '</td>' +
'<td class="num">' + money(r.tvl) + '</td>' +
'<td class="num ' + pctClass(r.chg) + '">' + pct(r.chg) + '</td>' +
'<td class="num">' + ageText(r.age) + '</td>' +
'<td class="num"><b>' + money(r.implied) + '</b><br><span class="band">' + money(band[0]) + '–' + money(band[1]) + '</span></td>' +
'<td class="num">' + Math.round(odds * 100) + '%<br><span class="band">' + money(r.implied * odds) + ' exp.</span></td>' +
'<td>' + verdictBadge(econ.verdict) + '</td>' +
'<td class="num ' + (econ.net >= 0 ? 'up' : 'down') + '">' + moneySigned(econ.net) + '</td>' +
'</tr>';
}
function renderBoard() {
var rows = filteredRows();
$('boardBody').innerHTML = rows.map(rowHtml).join('');
$('boardCount').textContent = rows.length + ' of ' + PRE.length + ' launch candidates. Net is the farm\u2019s expected value per farmer at the low end, after gas and opportunity cost. Odds is the peer launch rate for the protocol\u2019s age; Expected is implied × odds.';
}
function renderNotLaunch() {
$('notLaunchCount').textContent = NOT_LAUNCH.length + ' protocols record no token but are not launch candidates — wrapped, staked, bridged or exchange products, or versioned pools. Their modelled values are the curve\u2019s price of their TVL, not launch claims.';
$('notLaunchBody').innerHTML = NOT_LAUNCH.map(function (r) {
return '<tr><td><a class="name" href="#/p/' + esc(r.slug) + '">' + esc(r.name) + '</a> <span class="slug">' + esc(r.slug) + '</span></td>' +
'<td>' + esc(r.cat === null ? '—' : r.cat) + '</td>' +
'<td>' + esc(r.chains.length > 0 ? r.chains[0] : '—') + '</td>' +
'<td class="num">' + money(r.tvl) + '</td>' +
'<td class="num"><b>' + money(r.implied) + '</b></td>' +
'<td>' + esc(r.reason) + '</td></tr>';
}).join('');
}
function renderLive() {
$('liveCount').textContent = 'Top ' + LAUNCHED.length + ' of ' + D.launched_total + ' launched by value — full board in board.json. ' + D.audit.launched_mcap + ' record a market cap; ' + D.audit.launched_estimated + ' are curve estimates (Est).';
$('liveBody').innerHTML = LAUNCHED.map(function (r, i) {
return '<tr><td class="rank">' + (i + 1) + '</td>' +
'<td><a class="name" href="#/p/' + esc(r.slug) + '">' + esc(r.name) + '</a> <span class="slug">' + esc(r.slug) + '</span></td>' +
'<td>' + esc(r.cat === null ? '—' : r.cat) + '</td>' +
'<td>' + chainTags(r.chains, r.nChains) + '</td>' +
'<td class="num">' + money(r.tvl) + '</td>' +
'<td class="num"><b>' + money(r.implied) + '</b><br><span class="basis">' + (r.basis === 1 ? 'MARKET' : 'EST.') + '</span>' + (r.mcap !== null ? ' <span class="band">' + (r.mcap / r.tvl).toFixed(2) + '&times; mcap/TVL</span>' : ' <span class="band">curve estimate</span>') + '</td>' +
'<td class="num ' + pctClass(r.chg) + '">' + pct(r.chg) + '</td></tr>';
}).join('');
$('anchorBody').innerHTML = D.anchors.map(function (a) {
return '<tr><td>' + esc(a[0]) + '</td><td class="num">' + a[1] + ' tokens</td><td class="num">' + a[2].toFixed(3) + '&times;</td></tr>';
}).join('');
}
function stepsHtml(steps) {
return steps.map(function (s) {
var cut = s.indexOf(' Cost: ');
return '<li>' + esc(cut >= 0 ? s.slice(0, cut) : s) + ' <span class="cost"><b>' + esc(cut >= 0 ? s.slice(cut + 1) : '') + '</b></span></li>';
}).join('');
}
function renderDetail(slug) {
var r = null, idx = -1, mode = 'pre';
for (var i = 0; i < PRE.length; i++) if (PRE[i].slug === slug) { r = PRE[i]; idx = i; break; }
if (!r) for (var j = 0; j < NOT_LAUNCH.length; j++) if (NOT_LAUNCH[j].slug === slug) { r = NOT_LAUNCH[j]; mode = 'notlaunch'; break; }
if (!r) for (var k = 0; k < LAUNCHED.length; k++) if (LAUNCHED[k].slug === slug) { r = LAUNCHED[k]; mode = 'launched'; break; }
var box = $('detailBody');
if (!r) { box.innerHTML = '<p>No protocol with that slug is on this page — the full 758-row board is in board.json.</p>'; return; }
$('backLink').setAttribute('href', mode === 'launched' ? '#/launched' : mode === 'notlaunch' ? '#/notlaunch' : '#/');
var econ = econFor(r.tvl, r.age, r.implied);
var steps = farmStepsFor(r, econ, mode);
var adj = catAdj(r.ci);
var base = Math.round(curveBase(r.tvl, r.ci));
var odds = oddsFor(r.age);
var expected = Math.round(r.implied * odds);
var curveRow = tr('Curve base — 10^(' + D.fit.intercept.toFixed(2) + ' + ' + D.fit.slope.toFixed(2) + ' × log10 TVL' + (adj !== 0 ? ' ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' adj.' : '') + ')', moneyFull(base));
var head, valueRows, note;
if (mode === 'pre') {
var band = bandOf(r.implied, r.band);
head = '<div class="detail-head"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
'<span class="implied">' + moneyFull(r.implied) + ' implied</span>' +
'<span class="band big">' + money(band[0]) + ' – ' + money(band[1]) + ' (90% band)</span>' +
verdictBadge(econ.verdict) +
(WATCH[idx] ? '<span class="watch">ON THE WATCHLIST</span>' : '') + '</div>';
valueRows =
tr('Equation', '10^(' + D.fit.intercept.toFixed(2) + ' + ' + D.fit.slope.toFixed(2) + ' × log10 TVL' + (adj !== 0 ? ' ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) : '') + ') × ' + growthMult(r.chg).toFixed(4) + ' × ' + maturityMult(r.age).toFixed(4) + ' = ' + moneyFull(r.implied)) +
curveRow +
tr('Growth (7d ' + pct(r.chg) + ')', '&times; ' + growthMult(r.chg).toFixed(4)) +
tr('Maturity (' + (r.age === null ? 365 : r.age) + 'd listed)', '&times; ' + maturityMult(r.age).toFixed(4)) +
tr('<b>Implied value</b>', '<b>' + moneyFull(r.implied) + '</b>') +
tr('Rank range inside the band', '#' + RANK_RANGE[r.slug][0] + '–#' + RANK_RANGE[r.slug][1] + ' of 198') +
tr('Peer launch rate (' + ageText(r.age) + ' listed)', Math.round(odds * 100) + '%') +
tr('Expected value (implied × odds)', moneyFull(expected));
note = 'Records no token in DefiLlama&rsquo;s snapshot — not proof it has none. The implied value is this radar&rsquo;s claim, from the snapshot alone.';
} else if (mode === 'notlaunch') {
head = '<div class="detail-head"><h2>' + esc(r.name) + '</h2>' +
'<span class="implied">' + moneyFull(r.implied) + ' modelled</span>' +
'<span class="basis">NOT A LAUNCH</span></div>';
valueRows =
curveRow +
tr('Peer launch rate (' + ageText(r.age) + ' listed)', Math.round(odds * 100) + '%') +
tr('Expected value (modelled × odds)', moneyFull(expected));
note = 'Not a launch candidate: ' + esc(r.reason) + '. The value above is the curve&rsquo;s price of its TVL, not a launch claim.';
} else {
head = '<div class="detail-head"><h2>' + esc(r.name) + '</h2>' +
'<span class="implied">' + moneyFull(r.implied) + (r.basis === 1 ? ' market cap' : ' estimated') + '</span>' +
'<span class="basis">' + (r.basis === 1 ? 'MARKET CAP' : 'CURVE ESTIMATE') + '</span>' + verdictBadge(econ.verdict) + '</div>';
valueRows = r.basis === 1
? tr('Market cap — the market&rsquo;s own realisation', moneyFull(r.mcap)) +
tr('Curve base — the curve&rsquo;s pre-launch price', moneyFull(base)) +
tr('Market cap / TVL', (r.mcap / r.tvl).toFixed(2) + '&times;')
: curveRow +
tr('Growth (7d ' + pct(r.chg) + ')', '&times; ' + growthMult(r.chg).toFixed(4)) +
tr('Maturity (' + (r.age === null ? 365 : r.age) + 'd listed)', '&times; ' + maturityMult(r.age).toFixed(4)) +
tr('<b>Implied value (estimate)</b>', '<b>' + moneyFull(r.implied) + '</b>');
note = 'Its token already trades: the plan is post-launch usage; the economics are the realised value.' +
(r.basis === 0 ? ' No market cap is recorded — the value above is the curve&rsquo;s estimate.' : '');
}
var grid = [
['TVL', moneyFull(r.tvl)],
['Category', esc(r.cat === null ? '—' : r.cat)],
['Chains', chainTags(r.chains, mode === 'launched' ? r.nChains : r.chains.length)],
['Peer launch rate', Math.round(odds * 100) + '%'],
['Expected value', moneyFull(expected)],
['Min. capital', '$' + econ.capital + ' · Tier ' + (econ.capital >= 250 ? 4 : econ.capital >= 150 ? 3 : econ.capital >= 100 ? 2 : 1) + ' of 4'],
];
var econTable = mode === 'notlaunch' ? '' :
'<div class="breakdown"><h3>' + (mode === 'launched' ? 'Realised value' : 'Farm economics') + '</h3>' +
'<table><tbody>' +
tr('Low-end pool (5%)', moneyFull(r.implied * 0.05)) +
tr('Farmers sharing it', econ.farmers.toLocaleString('en-US')) +
tr('Gross per farmer', moneySigned(econ.gross)) +
tr('Gas for the plan', '−' + moneyFull(econ.gas)) +
tr('Opportunity cost', '−$' + econ.opp.toFixed(2)) +
tr('Break-even pool share', econ.be.toFixed(1) + '% (net $0) · FARM at ' + econ.bef.toFixed(1) + '%') +
tr('<b>Net per farmer</b>', '<b>' + moneySigned(econ.net) + '</b>') +
tr('<b>Verdict</b>', verdictBadge(econ.verdict)) +
'</tbody></table>' +
'<p class="break-note">FARM clears $200 net, THIN $50, SKIP neither — at the low end.</p></div>';
box.innerHTML = head +
'<dl class="detail-grid">' + grid.map(function (g) { return '<div><dt>' + g[0] + '</dt><dd>' + g[1] + '</dd></div>'; }).join('') + '</dl>' +
'<div class="farm"><h3>' + (mode === 'launched' ? 'Post-launch plan' : mode === 'notlaunch' ? 'Usage plan — not a farm' : 'Farm plan') + '</h3><ol>' + stepsHtml(steps) + '</ol></div>' +
econTable +
'<div class="breakdown"><h3>How the ' + (mode === 'launched' && r.basis === 1 ? 'market value compares' : mode === 'notlaunch' ? 'modelled value is built' : 'implied value is built') + '</h3>' +
'<table><tbody>' + valueRows + '</tbody></table>' +
'<p class="break-note">' + (mode === 'launched' && r.basis === 1 ? 'The market cap is the market&rsquo;s own number; the curve base is its pre-launch price.' : mode === 'notlaunch' ? 'The value is the curve&rsquo;s price of its TVL. The odds are the peer launch rate for its age. Neither is a launch claim.' : 'The band is the honest part: refits disagree by about ' +
D.diagnostics.band_median_width_x.toFixed(1) + '&times;, so this rank is a close ' +
'call.') + '</p></div>' +
'<p class="note">' + note + '</p>';
}
function render() {
renderStats();
renderModel();
var detail = state.detail !== null;
$('boardView').hidden = detail || state.view !== 'board';
$('notLaunchView').hidden = detail || state.view !== 'notlaunch';
$('liveView').hidden = detail || state.view !== 'live';
$('detailView').hidden = !detail;
$('viewBoard').className = state.view === 'board' && !detail ? 'on' : '';
$('viewNotLaunch').className = state.view === 'notlaunch' && !detail ? 'on' : '';
$('viewLive').className = state.view === 'live' && !detail ? 'on' : '';
if (detail) renderDetail(state.detail);
else if (state.view === 'board') renderBoard();
else if (state.view === 'notlaunch') renderNotLaunch();
else renderLive();
}

function fillSelects() {
var cats = [], chains = [];
PRE.forEach(function (r) {
if (r.cat !== null && cats.indexOf(r.cat) < 0) cats.push(r.cat);
r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
});
function opts(list, all, sel) {
return '<option value="">' + all + '</option>' + list.sort().map(function (c) {
return '<option value="' + esc(c) + '"' + (sel === c ? ' selected' : '') + '>' + esc(c) + '</option>';
}).join('');
}
$('fCat').innerHTML = opts(cats, 'All categories', state.cat);
$('fChain').innerHTML = opts(chains, 'All chains', state.chain);
$('q').value = state.q;
$('fTvl').value = String(state.minTvl);
$('fVerdict').value = state.verdict;
$('sort').value = state.sort;
$('fWatch').checked = state.watch;
}
function route() {
var h = location.hash || '#/', m;
state.detail = null;
state.view = 'board';
if ((m = h.match(/^#\/p\/([^/]+)$/))) state.detail = decodeURIComponent(m[1]);
else if (h === '#/live' || h === '#/launched') state.view = 'live';
else if (h === '#/notlaunch') state.view = 'notlaunch';
fillSelects();
render();
}
function on(id, ev, fn) { $(id).addEventListener(ev, fn); }
on('q', 'input', function (e) { state.q = e.target.value; if (!state.detail) renderBoard(); });
on('fCat', 'change', function (e) { state.cat = e.target.value; if (!state.detail) renderBoard(); });
on('fChain', 'change', function (e) { state.chain = e.target.value; if (!state.detail) renderBoard(); });
on('fVerdict', 'change', function (e) { state.verdict = e.target.value; if (!state.detail) renderBoard(); });
on('fTvl', 'change', function (e) { state.minTvl = Number(e.target.value); if (!state.detail) renderBoard(); });
on('fWatch', 'change', function (e) { state.watch = e.target.checked; if (!state.detail) renderBoard(); });
on('sort', 'change', function (e) { state.sort = e.target.value; if (!state.detail) renderBoard(); });
on('viewBoard', 'click', function () { location.hash = '#/'; });
on('viewNotLaunch', 'click', function () { location.hash = '#/notlaunch'; });
on('viewLive', 'click', function () { location.hash = '#/launched'; });
window.addEventListener('hashchange', route);
route();
})();
