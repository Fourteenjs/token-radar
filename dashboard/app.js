// Token Radar page: no framework, no network. Reads window.RADAR (data.js) and renders
// the pre-token board, the launched reference with anchors, and one protocol's detail.
// Farm plans are regenerated here from the same inputs as board.json, so page and board
// agree. The sandbox re-runs the same model with the reader's growth assumption, labelled
// as hypothetical. Rows (data.js): pre-token slug|name|cat36|chain36s|tvl36|change_7d|
// age36|band36 (launch rank is the line's position); launched
// slug|name|cat36|chain36s~total36|tvl36|mcap36|change_7d|age36|basis (1 = market cap,
// 0 = curve estimate). Integers are base-36 (lib/model.ts b36); the 7-day change stays
// decimal. Implied value is NOT stored: it is recomputed here from TVL, change, age and the
// full-precision fit and adjustments, same operation order as lib/model.ts impliedValue,
// so page and board agree to the dollar. A row's name is lib/model.ts encodeName's form:
// empty when it is the slug's implied name, a base-36 case mask when it differs only by
// letter case, '=' plus the full name otherwise. Verdict and net are re-derived with
// lib/model.ts's constants. PRODUCT tags a wrapped, staked, bridged or exchange product:
// the snapshot records no token for it, but it is not a launch in the usual sense.
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
// Integers in the rows are base-36 (lib/model.ts b36); the 7-day change stays decimal.
function parsePre(line, i) {
  var f = line.split('|');
  var ci = f[2] === '' ? -1 : parseInt(f[2], 36), chg = f[5] === '' ? null : +f[5], age = f[6] === '' ? null : parseInt(f[6], 36), tvl = parseInt(f[4], 36);
  return { i: i, rank: i + 1, slug: f[0], name: decodeName(f[0], f[1]), cat: ci < 0 ? null : D.cat_names[ci], ci: ci, chains: f[3].split(',').map(function (x) { return D.chain_names[parseInt(x, 36)]; }), tvl: tvl, chg: chg, age: age, implied: modelImplied(tvl, ci, chg, age), band: parseInt(f[7], 36) / 100, launched: false };
}
function parseLaunched(line) {
  var f = line.split('|'), c = f[3].split('~');
  var ci = f[2] === '' ? -1 : parseInt(f[2], 36), mcap = f[5] === '' ? null : parseInt(f[5], 36), chg = f[6] === '' ? null : +f[6], age = f[7] === '' ? null : parseInt(f[7], 36), tvl = parseInt(f[4], 36);
  return { slug: f[0], name: decodeName(f[0], f[1]), cat: ci < 0 ? null : D.cat_names[ci], ci: ci, chains: c[0].split(',').map(function (x) { return D.chain_names[parseInt(x, 36)]; }), nChains: parseInt(c[1], 36), tvl: tvl, mcap: mcap, chg: chg, age: age, implied: mcap !== null ? mcap : modelImplied(tvl, ci, chg, age), basis: +f[8], launched: true };
}
var PRE = D.rows === '' ? [] : D.rows.split('\n').map(parsePre);
var LAUNCHED = D.launched === '' ? [] : D.launched.split('\n').map(parseLaunched);
var WATCH = {};
D.watchlist_rows.forEach(function (i) { WATCH[i] = true; });

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
// A wrapped, staked, bridged or exchange product (the round-3 exclusion rule, kept as a tag).
// The rule's exchange-name clause is left out here: no row in this snapshot needs it — every
// exchange-named protocol is already caught by its category or a wrapped/staked word.
function isProduct(cat, name) {
  return /\b(wrapped|staked|staking)\b/i.test(name) || /^(Bridge|Canonical Bridge|Liquid Staking|Liquid Restaking|Restaked BTC|CEX)$/.test(cat || '') || /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(name);
}

// Model constants from lib/model.ts (growth clamped −80…+200%, log-dampened, weight 0.5;
// maturity 0.6→1.0 over 3y, unknown age 365d; farmers 800×(TVL/$1M)^0.35, 500..120000;
// gas $4+$8+$3+$6+$2/week, max 9 weeks; opportunity cost 5%/yr on 1.5× capital).
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
// One row's economics, exactly as lib/model.ts farmEconomics computes them.
function econFor(tvl, age, implied) {
  var farmers = farmersEst(tvl), capital = capitalFor(tvl), hold = holdDays(age), gas = gasFor(hold);
  var opp = Math.round(1.5 * capital * 0.05 * hold / 365 * 100) / 100;
  var net = Math.round((implied * 0.05 / farmers - gas - opp) * 10) / 10;
  var gross = Math.round((net + gas + opp) * 100) / 100;
  return { verdict: net >= 200 ? 'FARM' : net >= 50 ? 'THIN' : 'SKIP', net: net, gross: gross, farmers: farmers, gas: gas, opp: opp, capital: capital, hold: hold };
}

// Farm plan: one entry per mechanism — [keywords, action, weekly, signal, risk] — shared
// with lib/model.ts, so page and board render the same eight steps. Last entry is generic.
var KINDS = [
  [['lend', 'cdp', 'collateral'], 'Lend {CAP} USDC into {NAME}\'s {CHAIN} market; leave it earning.', 'Top up, trim, or borrow a little and repay.', 'a points program, a borrow incentive or a token vote', 'A borrow liquidates if the collateral falls — never borrow near the limit.'],
  [['dex', 'yield', 'leveraged farm', 'liquidity', 'farm'], 'Add {CAP} of liquidity to {NAME}\'s deepest pool on {CHAIN}; hold it.', 'Rebalance the range or compound the yield once.', 'a points program, a mining season or a fee-share vote', 'LP positions lose to impermanent loss when prices move apart.'],
  [['perpetual', 'derivative', 'basis', 'option'], 'Post {CAP} USDC as margin on {NAME}; open one small hedged position.', 'Close and reopen one small hedged position.', 'a trading competition, a fee rebate season or a token vote', 'Leveraged positions can liquidate in minutes — never leave one open.'],
  [['prediction'], 'Back one outcome with {CAP} on {NAME}; hold it through settlement.', 'Settle one small position; open another on a live market.', 'a trading rewards season or a token announcement', 'A losing prediction keeps nothing — the stake is spent, not deposited.'],
  [['rwa'], 'Mint {CAP} of {NAME}\'s yield-bearing asset on {CHAIN}; hold it.', 'Check the yield; add a small amount.', 'a yield distribution, a new asset listing or a token announcement', 'A real-world asset depends on its issuer and custodian — read who holds it.'],
  [['stable'], 'Mint or hold {CAP} of the stable asset issued by {NAME} on {CHAIN}.', 'Mint, redeem or move a small amount.', 'a stability pool incentive, a peg change or a token announcement', 'A stable asset can lose its peg — the principal is not guaranteed.'],
  [['curator', 'allocator', 'index', 'aggregator', 'vault'], 'Deposit {CAP} into a {NAME} vault on {CHAIN}; keep the shares.', 'Rebalance between two vaults or add a little.', 'a vault points program, a curator fee share or a token vote', 'A vault strategy can lose money — read what it holds.'],
  [['insurance'], 'Buy {CAP} of cover from {NAME} on {CHAIN}; keep the policy active.', 'Check the cover; renew it before it lapses.', 'a cover mining season, a claims program or a token vote', 'An insurance premium is spent, not deposited — and a claim may be denied.'],
  [['bridge'], 'Bridge {CAP} USDC into {CHAIN} through {NAME}; put the funds to work in its app.', 'Bridge a small amount back and forth.', 'a bridging rewards season or a token announcement', 'A bridge can freeze or lose funds — never bridge more than the farm needs.'],
  [['staking', 'restak'], 'Stake {CAP} of the chain\'s staking asset through {NAME}; keep the receipt.', 'Restake the rewards or add a little.', 'a restaking points program or a token announcement', 'Staked assets can be slashed or locked — check the lock-up.'],
  [['cex'], 'Trade {CAP} on {NAME}\'s spot market in two pairs; keep only the farm\'s balance on the exchange.', 'Place one small spot trade a week in a different pair.', 'a fee-discount season, a new listing or a token announcement', 'A centralised exchange holds your funds and can freeze withdrawals.'],
  [['chain'], 'Bridge {CAP} USDC onto {NAME}; use one native app with the bridged funds.', 'Use one native app on {NAME} each week — a swap, a deposit, a vote.', 'a native rewards season or a token announcement', 'A young chain\'s apps can be unaudited — never bridge more than the farm needs.'],
  [[], 'Deposit {CAP} USDC into {NAME} on {CHAIN}; keep the position open.', 'Do one real action — a deposit, a swap, a vote — each week.', 'a points program, a rewards season or a token announcement', 'Smart-contract risk applies to every deposit.']
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
function gasReserve(chain) {
  if (chain === 'Ethereum') return '$20 gas reserve';
  if (chain === 'Base' || chain === 'Arbitrum' || chain === 'Optimism') return '$5 gas reserve';
  if (chain === 'Solana') return '$2 of SOL for fees';
  if (chain === 'Binance' || chain === 'Polygon') return '$2 gas reserve';
  return '$5 gas reserve';
}
var WATCH_PLACES = ['on the protocol\'s announcements', 'in its governance forum or changelog', 'on its official social account'];
var WEEKLY_CLOSERS = ['Vary the amount each time ($20–$100).', 'Use a different pair or market each session.', 'Spread the actions across distinct weeks — a same-day burst reads as one.'];
var EXIT_LINES = ['unwind in two steps', 'keep a small residual position and unwind the rest', 'bridge back to your starting chain, then unwind'];
function fillTpl(t, cap, name, chain) { return t.split('{CAP}').join('$' + cap).split('{NAME}').join(name).split('{CHAIN}').join(chain); }
function farmStepsFor(p, econ, launched) {
  function stepText(s) {
    var x = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
    if (x.length > 600) x = x.slice(0, 596) + '...';
    if (x.length < 20) x += ' Hold the position and check the protocol\'s own page.';
    return x;
  }
  var chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
  var capital = econ.capital, hold = econ.hold, kind = kindFor(p.cat);
  var h = slugHash(p.slug);
  var depth = [];
  if (p.chains.length > 1) depth.push('Repeat the core position on ' + p.chains[1] + ' with half the capital.');
  depth.push('Add a second, smaller deposit to another main market.');
  depth.push('Open the same position in a second pair or market with half the capital.');
  var first = launched
    ? 'Open ' + p.name + '\'s own app from its official site and check the token there — never buy it from a link in a chat or an ad. Use a wallet you hold, or a fresh one funded on ' + chain + '.'
    : 'Set aside a fresh wallet for this farm, fund it on ' + chain + ' with only the capital below plus a ' + gasReserve(chain) + ', and store its recovery phrase on paper.';
  var fifth = launched
    ? 'Keep the position open at least ' + hold + ' days; collect its fees or yield and check it weekly.'
    : 'Hold the position at least ' + hold + ' days and check ' + p.name + '\'s rewards page weekly; claim only through links the protocol itself publishes.';
  var sixth = launched
    ? 'Check ' + p.name + '\'s governance page monthly and vote on one live proposal if you hold a vote.'
    : 'Watch for ' + kind[3] + ' ' + WATCH_PLACES[h % WATCH_PLACES.length] + ' — then check the protocol\'s own page daily.';
  var tail = econ.verdict === 'FARM' ? '.' : econ.verdict === 'THIN' ? ': worth it only if you are already on the chain.' : ': the low end does not pay for the farm.';
  var seventh = launched
    ? 'Realised value: this protocol\'s token already trades' + (p.mcap !== null && p.mcap > 0 ? ' at a market cap of $' + p.mcap.toLocaleString('en-US') : ', but no market cap is recorded, so the value above is the curve\'s estimate, not a market price') + '. At the low end (5% of the value among about ' + econ.farmers.toLocaleString('en-US') + ' farmers) farming it before launch would have been worth about $' + econ.gross.toFixed(0) + ' gross per farmer, a net of $' + econ.net.toFixed(0) + ' after costs' + tail
    : 'Verdict: ' + econ.verdict + ' — at the low end (5% of the implied value among about ' + econ.farmers.toLocaleString('en-US') + ' farmers) this farm expects $' + econ.gross.toFixed(0) + ' gross per farmer, a net of $' + econ.net.toFixed(0) + ' after costs' + tail;
  return [
    { text: first, cost: launched ? 'free to check' : '$4 gas to fund it', time: launched ? '10 min' : '5 min' },
    { text: fillTpl(kind[1], capital, p.name, chain), cost: '$' + capital + ' of capital + $8 gas', time: '15 min to set up' },
    { text: depth[h % depth.length], cost: 'half the capital again + $3 gas', time: '10 min' },
    { text: kind[2] + ' ' + WEEKLY_CLOSERS[h % WEEKLY_CLOSERS.length], cost: '$2 gas a week', time: '10 min a week' },
    { text: fifth, cost: 'the $' + capital + ' stays locked', time: hold + ' days' },
    { text: sixth, cost: 'free to watch', time: '5 min a week' },
    { text: seventh, cost: 'about $' + econ.gas + ' of gas plus $' + econ.opp.toFixed(2) + ' of opportunity cost', time: hold + ' days' },
    { text: 'Log the wallet, dates and every transaction hash, and plan the exit now: ' + EXIT_LINES[h % EXIT_LINES.length] + ' ' + (launched ? 'when you leave' : 'if the token launches') + ', and never pay anyone to claim for you. ' + kind[4], cost: '$6 gas to unwind', time: '5 min to log, 15 to unwind' }
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
    return r.implied;
  }
  rows.sort(function (a, b) { return sortKey(b) - sortKey(a) || a.rank - b.rank; });
  return rows;
}

var $ = function (id) { return document.getElementById(id); };
function tr(a, b) { return '<tr><td>' + a + '</td><td class="num">' + b + '</td></tr>'; }
function renderStats() {
  $('asOf').textContent = D.as_of;
  $('srcLine').textContent = D.source;
  $('stats').textContent = (PRE.length + D.launched_total) + ' ranked · ' + PRE.length + ' pre-token · ' +
    D.launched_total + ' launched · ' + D.watchlist_rows.length + ' watchlist · verdicts ' +
    D.verdicts.FARM + ' farm / ' + D.verdicts.THIN + ' thin / ' + D.verdicts.SKIP + ' skip';
}
function renderModel() {
  var f = D.fit, b = D.backtest, dg = D.diagnostics;
  $('modelNote').innerHTML =
    'Fitted on the snapshot&rsquo;s own ' + f.n_comps + ' live-token protocols (R² ' + f.r2.toFixed(2) +
    '): a dollar of TVL is worth less in market cap the bigger the protocol gets. Category ' +
    'adjustments are median residuals, shrunk and clamped to ±0.30. Growth is the ' +
    '7-day TVL change clamped to −80…+200% and dampened with a log, weight 0.5. Maturity runs 0.6 → 1.0 over ' +
    '3 years listed; no listing date counts as 1 year. <b>The band.</b> ' + dg.bootstrap_draws + ' bootstrap refits: ' +
    'the median 90% band is ' + dg.band_median_width_x.toFixed(1) + '&times; wide (high / low), so neighbours ' +
    'inside one band are close calls.';
  $('backtestLine').innerHTML =
    '<b>Tested out of sample.</b> 5-fold CV on the ' + b.cv_n + ' comps: median error ' +
    b.cv_median_abs_log10.toFixed(2) + ' in log10 (a typical fitted value is off by about ' +
    Math.pow(10, b.cv_median_abs_log10).toFixed(1) + '&times;), ' + (b.cv_within_2x * 100).toFixed(0) + '% of held-out caps ' +
    'within 2&times;. Out-of-time (fitted before ' + b.blind_cutoff + '): median ratio ' +
    b.blind_median_ratio.toFixed(2) + ', ' + (b.blind_within_2x * 100).toFixed(0) + '% within 2&times; on ' +
    b.blind_n + ' newer protocols. It beats a category-median multiple (' +
    b.cv_median_abs_log10.toFixed(2) + ' vs ' + b.baseline_cv_median_abs_log10.toFixed(2) + ').';
  $('adjustments').textContent = 'Adjustments: ' + D.cat_names.map(function (c, i) { return [c, D.cat_adjustments[i]]; })
    .filter(function (p) { return p[1] !== 0; })
    .map(function (p) { return p[0] + ' ' + (p[1] >= 0 ? '+' : '') + p[1].toFixed(2); }).join(', ') + '. Others ±0.00.';
}
function rowHtml(r) {
  var econ = econFor(r.tvl, r.age, r.implied);
  var band = bandOf(r.implied, r.band);
  return '<tr>' +
    '<td class="rank">' + r.rank + '</td>' +
    '<td><a class="name" href="#/p/' + esc(r.slug) + '">' + esc(r.name) + '</a> <span class="slug">' + esc(r.slug) + '</span>' +
    (WATCH[r.i] ? ' <span class="watch">WATCHLIST</span>' : '') + (isProduct(r.cat, r.name) ? ' <span class="basis">PRODUCT</span>' : '') + '</td>' +
    '<td>' + esc(r.cat === null ? '—' : r.cat) + '</td>' +
    '<td>' + chainTags(r.chains, r.chains.length) + '</td>' +
    '<td class="num">' + money(r.tvl) + '</td>' +
    '<td class="num ' + pctClass(r.chg) + '">' + pct(r.chg) + '</td>' +
    '<td class="num">' + ageText(r.age) + '</td>' +
    '<td class="num"><b>' + money(r.implied) + '</b><br><span class="band">' + money(band[0]) + '–' + money(band[1]) + '</span></td>' +
    '<td>' + verdictBadge(econ.verdict) + '</td>' +
    '<td class="num ' + (econ.net >= 0 ? 'up' : 'down') + '">' + moneySigned(econ.net) + '</td>' +
    '</tr>';
}
function renderBoard() {
  var rows = filteredRows();
  $('boardBody').innerHTML = rows.map(rowHtml).join('');
  $('boardCount').textContent = rows.length + ' of ' + PRE.length + ' pre-token protocols. Net is the farm\u2019s expected value per farmer at the low end, after gas and opportunity cost; the range under each value is its 90% band. PRODUCT: a wrapped, staked, bridged or exchange product — not a launch in the usual sense.';
}
function renderLive() {
  $('liveCount').textContent = 'Top ' + LAUNCHED.length + ' of ' + D.launched_total + ' launched protocols by value — full board in board.json. ' + D.audit.launched_mcap + ' record a market cap; ' + D.audit.launched_estimated + ' are curve estimates, labelled Est.';
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
  var r = null, idx = -1, launched = false;
  for (var i = 0; i < PRE.length; i++) if (PRE[i].slug === slug) { r = PRE[i]; idx = i; break; }
  if (!r) for (var j = 0; j < LAUNCHED.length; j++) if (LAUNCHED[j].slug === slug) { r = LAUNCHED[j]; launched = true; break; }
  var box = $('detailBody');
  if (!r) { box.innerHTML = '<p>No protocol with that slug is on this page — the full 758-row board is in board.json.</p>'; return; }
  $('backLink').setAttribute('href', launched ? '#/launched' : '#/');
  var econ = econFor(r.tvl, r.age, r.implied);
  var steps = farmStepsFor(r, econ, launched);
  var adj = catAdj(r.ci);
  var base = Math.round(curveBase(r.tvl, r.ci));
  var curveRow = tr('Curve base — 10^(' + D.fit.intercept.toFixed(2) + ' + ' + D.fit.slope.toFixed(2) + ' × log10 TVL' + (adj !== 0 ? ' ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' adj.' : '') + ')', moneyFull(base));
  var head, valueRows, note, sandbox = '';
  if (!launched) {
    var band = bandOf(r.implied, r.band);
    head = '<div class="detail-head"><h2>#' + r.rank + ' ' + esc(r.name) + '</h2>' +
      '<span class="implied">' + moneyFull(r.implied) + ' implied</span>' +
      '<span class="band big">' + money(band[0]) + ' – ' + money(band[1]) + ' (90% band)</span>' +
      verdictBadge(econ.verdict) +
      (WATCH[idx] ? '<span class="watch">ON THE WATCHLIST</span>' : '') + (isProduct(r.cat, r.name) ? ' <span class="basis">PRODUCT</span>' : '') + '</div>';
    valueRows =
      curveRow +
      tr('Growth (7d ' + pct(r.chg) + ')', '&times; ' + growthMult(r.chg).toFixed(4)) +
      tr('Maturity (' + (r.age === null ? 365 : r.age) + 'd listed)', '&times; ' + maturityMult(r.age).toFixed(4)) +
      tr('<b>Implied value</b>', '<b>' + moneyFull(r.implied) + '</b>');
    note = 'Records no token in DefiLlama&rsquo;s snapshot — not proof it has none. The implied value is this radar&rsquo;s claim, from the snapshot alone.';
    sandbox = '<div class="breakdown sandbox"><h3>What if — test the model yourself</h3>' +
      '<p class="break-note">Your assumption, not the board&rsquo;s — the board keeps the snapshot&rsquo;s 7-day change.</p>' +
      '<label class="sand-ctl">7-day TVL change <input type="range" id="sbGrowth" min="-80" max="200" step="0.01" value="' + (r.chg === null ? 0 : Math.round(Math.min(200, Math.max(-80, r.chg)) * 100) / 100) + '"> <b id="sbGrowthVal">' + pct(r.chg) + '</b></label>' +
      '<p class="sand-out">At your assumption: <b id="sbOut">' + moneyFull(r.implied) + ' implied · ' +
      moneySigned(econ.gross) + ' gross · ' + moneySigned(econ.net) + ' net · ' + econ.verdict + '</b></p></div>';
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
    note = 'Its token already trades: the plan is post-launch usage, and the economics are the ' +
      'realised value — what farming it before launch would have been worth.' +
      (r.basis === 0 ? ' No market cap is recorded, so the value above is the curve&rsquo;s estimate, not a market price.' : '');
  }
  var grid = [
    ['TVL', moneyFull(r.tvl)],
    ['Category', esc(r.cat === null ? '—' : r.cat)],
    ['Chains', chainTags(r.chains, launched ? r.nChains : r.chains.length)],
  ];
  box.innerHTML = head +
    '<dl class="detail-grid">' + grid.map(function (g) { return '<div><dt>' + g[0] + '</dt><dd>' + g[1] + '</dd></div>'; }).join('') + '</dl>' +
    '<div class="farm"><h3>' + (launched ? 'Post-launch plan' : 'Farm plan') + '</h3><ol>' + stepsHtml(steps) + '</ol></div>' +
    '<div class="breakdown"><h3>' + (launched ? 'Realised value' : 'Farm economics') + '</h3>' +
    '<table><tbody>' +
    tr('Low-end pool (5%)', moneyFull(r.implied * 0.05)) +
    tr('Farmers sharing it', econ.farmers.toLocaleString('en-US')) +
    tr('Gross per farmer', moneySigned(econ.gross)) +
    tr('Gas for the plan', '−' + moneyFull(econ.gas)) +
    tr('Opportunity cost', '−$' + econ.opp.toFixed(2)) +
    tr('<b>Net per farmer</b>', '<b>' + moneySigned(econ.net) + '</b>') +
    tr('<b>Verdict</b>', verdictBadge(econ.verdict)) +
    '</tbody></table>' +
    '<p class="break-note">FARM clears $200 net, THIN $50, SKIP neither — at the low end.</p></div>' +
    '<div class="breakdown"><h3>How the ' + (launched && r.basis === 1 ? 'market value compares' : 'implied value is built') + '</h3>' +
    '<table><tbody>' + valueRows + '</tbody></table>' +
    '<p class="break-note">' + (launched && r.basis === 1 ? 'The market cap is the market&rsquo;s own number; the curve base is its pre-launch price.' : 'The band is the honest part: refits disagree by about ' +
    D.diagnostics.band_median_width_x.toFixed(1) + '&times;, so this rank is a close ' +
    'call.') + '</p></div>' +
    sandbox +
    '<p class="note">' + note + '</p>';
  if (!launched) {
    var sbG = $('sbGrowth');
    var recompute = function () {
      var gv = Number(sbG.value);
      var imp = Math.max(1, Math.round(base * growthMult(gv) * maturityMult(r.age)));
      var gross = imp * 0.05 / econ.farmers;
      var net = Math.round((gross - econ.gas - econ.opp) * 100) / 100;
      var verdict = net >= 200 ? 'FARM' : net >= 50 ? 'THIN' : 'SKIP';
      $('sbGrowthVal').textContent = pct(gv);
      $('sbOut').textContent = moneyFull(imp) + ' implied · ' + moneySigned(Math.round(gross * 100) / 100) + ' gross · ' + moneySigned(net) + ' net · ' + verdict;
    };
    sbG.addEventListener('input', recompute);
  }
}
function render() {
  renderStats();
  renderModel();
  var detail = state.detail !== null;
  $('boardView').hidden = detail || state.view !== 'board';
  $('liveView').hidden = detail || state.view !== 'live';
  $('detailView').hidden = !detail;
  $('viewBoard').className = state.view === 'board' && !detail ? 'on' : '';
  $('viewLive').className = state.view === 'live' && !detail ? 'on' : '';
  if (detail) renderDetail(state.detail);
  else if (state.view === 'board') renderBoard();
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
on('viewLive', 'click', function () { location.hash = '#/launched'; });
window.addEventListener('hashchange', route);
route();
})();
