// Token Radar's page: no framework, no network. Reads window.RADAR (dashboard/data.js) and
// renders the board, the live-token view with its anchors table, and one protocol's detail.
// The farm plan is generated here from the same inputs as board.json, so the page and the
// board agree. The what-if sandbox re-runs the same model with the reader's own growth and
// airdrop-share assumptions, and labels its numbers as hypothetical.
// Row layout in data.js (RadarRow): [rank, slug, name, category (index into cat_names),
// chains (indices into chain_names), tvl_usd, change_7d, age_days, implied_value_usd,
// verdict, net_usd, on_watchlist, band_half_dex]. The 90% band is implied / 10^half ..
// implied x 10^half.

(function () {
  'use strict';
  var D = window.RADAR;
  var state = { view: 'board', q: '', cat: '', chain: '', verdict: '', minTvl: 0, sort: 'implied', detail: null, watch: false };

  /* ------------------------------------------------------------ formatting */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function moneyFull(n) {
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function moneySigned(n) {
    return (n < 0 ? '−' : '') + moneyFull(Math.abs(n));
  }
  function pct(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function pctClass(v) {
    if (v === null || v === undefined) return '';
    return v >= 0 ? 'up' : 'down';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function verdictBadge(v) {
    return '<span class="verdict v-' + v.toLowerCase() + '">' + v + '</span>';
  }
  function chainList(s) {
    return String(s).split(',').map(function (i) { return D.chain_names[Number(i)]; });
  }
  function catName(i) {
    return i === null || i === undefined ? null : D.cat_names[i];
  }
  function chainTags(chains) {
    var list = typeof chains === 'string' ? chainList(chains) : chains;
    var shown = list.slice(0, 3).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('');
    return list.length > 3 ? shown + '<span class="tag">+' + (list.length - 3) + '</span>' : shown;
  }
  function catAdj(cat) {
    return cat !== null && D.cat_adjustments[cat] !== undefined ? D.cat_adjustments[cat] : 0;
  }
  /** The 90% band around an implied value, from its stored log half-width. */
  function bandOf(implied, half) {
    var f = Math.pow(10, half);
    return [implied / f, implied * f];
  }

  /* The model, re-derived with the constants lib/model.ts states: growth clamped to
     -80..+200%, log-dampened, weight 0.5; maturity 0.6 to 1.0 over 3 years, unknown age 365d;
     farmers 800 x (TVL / $1M)^0.35, 500..120000; gas $4 + $8 + $3 + $6 + $2/week, max 9 weeks;
     opportunity cost 5% a year on 1.5x the capital over the hold. */

  function growthMult(g) {
    var gc = g === null || g === undefined ? 0 : Math.min(200, Math.max(-80, g));
    return 1 + 0.5 * (gc < 0 ? -1 : gc > 0 ? 1 : 0) * (Math.log(1 + Math.abs(gc) / 100) / Math.log(3));
  }
  function maturityMult(age) {
    var d = age === null || age === undefined ? 365 : age;
    return 0.6 + (Math.min(Math.max(d, 0), 1095) / 1095) * 0.4;
  }
  function holdDays(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function capitalFor(tvl) {
    if (tvl >= 5000000000) return 250;
    if (tvl >= 1000000000) return 150;
    if (tvl >= 100000000) return 100;
    return 50;
  }
  function farmersEst(tvl) {
    return Math.min(120000, Math.max(500, Math.round(800 * Math.pow(tvl / 1000000, 0.35))));
  }
  function gasFor(hold) {
    return 4 + 8 + 3 + 6 + 2 * Math.min(Math.ceil(hold / 7), 9);
  }
  function oppFor(capital, hold) {
    return capital * 0.05 * hold / 365;
  }

  /* The farm plan. One table per mechanism — action, weekly action, launch signal, risk —
     shared with lib/model.ts, so the page and the board render the same eight steps. */

  var KINDS = [
    { k: ['lend', 'cdp', 'collateral'], a: 'Lend {CAP} of USDC into {NAME}\'s {CHAIN} market and leave the deposit earning.', w: 'Nudge the deposit up or down, or borrow a little and repay it, so the wallet shows real use.', s: 'a points program, a borrow incentive or a token-naming governance vote', r: 'A borrow can be liquidated if the collateral falls, so never borrow near the limit.' },
    { k: ['dex', 'yield', 'leveraged farm'], a: 'Add {CAP} of liquidity to {NAME}\'s deepest pool on {CHAIN} and hold the LP position.', w: 'Rebalance the LP range or compound the yield once, so the position keeps moving.', s: 'a points program, a mining season or a token-naming fee-share vote', r: 'Liquidity positions lose to impermanent loss when prices move apart, so size the position to survive it.' },
    { k: ['perpetual', 'derivative'], a: 'Post {CAP} of USDC as margin on {NAME} and open one small hedged position.', w: 'Close and reopen one small hedged position, so the account keeps trading without leaving leverage open.', s: 'a trading competition, a fee rebate season or a token-naming governance vote', r: 'Leveraged positions can be liquidated in minutes, so never leave one open unattended.' },
    { k: ['prediction'], a: 'Back one outcome with {CAP} on {NAME} and keep the position through settlement.', w: 'Settle one small position and open another on a live market, so the account keeps trading.', s: 'a trading rewards season or a token announcement', r: 'A losing prediction keeps nothing, so the stake is spent, not deposited — the verdict is an upper bound here.' },
    { k: ['rwa'], a: 'Mint {CAP} of {NAME}\'s yield-bearing asset on {CHAIN} and hold it.', w: 'Check the yield accrual and add a small amount, so the holding keeps growing.', s: 'a yield distribution, a new asset listing or a token announcement', r: 'A real-world asset depends on its issuer and custodian, so read who holds the underlying before minting.' },
    { k: ['stable'], a: 'Mint or hold {CAP} of the stable asset issued through {NAME} on {CHAIN}.', w: 'Mint, redeem or move a small amount of the stable asset, so the wallet shows real use.', s: 'a stability pool incentive, a peg change or a token announcement', r: 'A stable asset can lose its peg, so the principal is not guaranteed the way a deposit is.' },
    { k: ['curator', 'allocator', 'index', 'aggregator'], a: 'Deposit {CAP} into a {NAME} vault on {CHAIN} and keep the vault shares.', w: 'Rebalance between two vaults or add a small deposit, so the wallet shows an active allocator.', s: 'a vault points program, a curator fee share or a token announcement', r: 'A vault strategy can lose money, so read what it holds before depositing.' },
    { k: ['insurance'], a: 'Buy {CAP} of cover from {NAME} on {CHAIN} and keep the policy active.', w: 'Check the cover and renew it before it lapses, so the policy never goes quiet.', s: 'a cover mining season, a claims program or a token announcement', r: 'An insurance premium is spent, not deposited — the verdict is an upper bound here, and a claim may be denied.' },
    { k: ['bridge'], a: 'Bridge {CAP} of USDC into {CHAIN} through {NAME} and put the bridged funds to work in its app.', w: 'Bridge a small amount back and forth, so the wallet shows repeated use of its own route.', s: 'a bridging rewards season or a token announcement', r: 'A bridge can freeze or lose funds, so never bridge more than the farm needs at once.' },
    { k: ['staking', 'restak'], a: 'Stake {CAP} of the chain\'s staking asset through {NAME} and keep the receipt.', w: 'Restake the rewards or add a small stake, so the position keeps compounding.', s: 'a restaking points program or a token announcement', r: 'Staked assets can be slashed or locked, so check the lock-up before staking.' },
    { k: [], a: 'Deposit {CAP} of USDC into {NAME} on {CHAIN} and keep the position open.', w: 'Do one real action on the protocol, a deposit, a swap or a vote, so the wallet never sits idle for a full month.', s: 'a points program, a rewards season or a token announcement', r: 'Smart-contract risk applies to every deposit, so never farm with funds you cannot lose.' }
  ];
  function kindFor(cat) {
    var c = (cat || '').toLowerCase();
    for (var i = 0; i < KINDS.length - 1; i++) {
      var ks = KINDS[i].k;
      for (var j = 0; j < ks.length; j++) if (c.indexOf(ks[j]) >= 0) return KINDS[i];
    }
    return KINDS[KINDS.length - 1];
  }
  function fillTpl(t, cap, name, chain) {
    return t.split('{CAP}').join('$' + cap).split('{NAME}').join(name).split('{CHAIN}').join(chain);
  }

  function farmStepsFor(p, econ) {
    function chainOf() { return p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
    function stepText(step) {
      var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
      if (s.length > 600) s = s.slice(0, 596) + '...';
      if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
      return s;
    }
    var chain = chainOf();
    var capital = capitalFor(p.tvl_usd);
    var hold = holdDays(p.age_days);
    var kind = kindFor(p.category);
    var action = fillTpl(kind.a, capital, p.name, chain);
    var secondChain = p.chains.length > 1 ? p.chains[1] : null;
    var depth = secondChain !== null
      ? 'Repeat the core position on ' + secondChain + ' with half the capital, so the farm covers two chains.'
      : 'Add a second, smaller deposit to the protocol\'s other main market to widen the footprint.';
    var gas = gasFor(hold);
    var opp = Math.round(oppFor(capital * 1.5, hold) * 100) / 100;
    var tail = econ.verdict === 'FARM' ? '.' : econ.verdict === 'THIN' ? ': worth it only if you are already on the chain.' : ': the low end does not pay for the farm.';
    var verdictLine = 'Verdict: ' + econ.verdict + ' — at the low end of the band (5% of the implied value shared among about ' + econ.farmers.toLocaleString('en-US') + ' farmers) this farm expects about $' + econ.gross.toFixed(0) + ' gross per farmer, a net of about $' + econ.net.toFixed(0) + ' after costs' + tail;
    return [
      { text: 'Set aside a clean wallet for this farm alone, fund it with only the capital below, and store its recovery phrase offline on paper.', cost: 'about $4 in gas to fund it', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital plus about $8 of gas', time: '15 minutes to set up' },
      { text: depth, cost: 'about half the capital again and $3 of gas', time: '10 minutes' },
      { text: kind.w, cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days and check ' + p.name + '\'s points or rewards page weekly; only claim through links the protocol itself publishes.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: 'Watch for ' + kind.s + ': that is the signal the farm is about to pay, and the moment to check the protocol\'s own page daily.', cost: 'free to watch', time: '5 minutes a week' },
      { text: verdictLine, cost: 'about $' + gas + ' of gas plus $' + opp.toFixed(2) + ' of opportunity cost on the capital', time: hold + ' days' },
      { text: 'Log the wallet address, the dates and every transaction hash, and plan the exit now: unwind in two steps if the token launches, and never pay anyone to claim for you. ' + kind.r, cost: 'about $6 of gas to unwind', time: '5 minutes to log, 15 to unwind' },
    ].map(stepText);
  }

  /* ------------------------------------------------------------ filtering */

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.cat && catName(r[3]) !== state.cat) return false;
      if (state.chain && chainList(r[4]).indexOf(state.chain) < 0) return false;
      if (state.verdict && r[9] !== state.verdict) return false;
      if (state.watch && r[11] !== 1) return false;
      if (state.minTvl && r[5] < state.minTvl) return false;
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b[5] - a[5] || a[0] - b[0];
      if (key === 'growth') return (b[6] === null ? -1e9 : b[6]) - (a[6] === null ? -1e9 : a[6]) || a[0] - b[0];
      if (key === 'age') return ((b[7] === null ? -1 : b[7]) - (a[7] === null ? -1 : a[7])) || a[0] - b[0];
      if (key === 'net') return b[10] - a[10] || a[0] - b[0];
      return b[8] - a[8] || a[0] - b[0];
    });
    return rows;
  }

  /* ------------------------------------------------------------ rendering */

  var $ = function (id) { return document.getElementById(id); };

  function renderStats() {
    $('asOf').textContent = D.as_of;
    $('srcLine').textContent = D.source;
    $('stats').innerHTML =
      '<div><dt>Protocols</dt><dd>' + D.rows.length + ' <em>ranked</em></dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + D.watchlist_size + ' covered</dd></div>' +
      '<div><dt>Audited</dt><dd>' + D.audit.pre_token + ' pre-token</dd></div>' +
      '<div><dt>Comps</dt><dd>' + D.fit.n_comps + ' live tokens</dd></div>' +
      '<div><dt>Verdicts</dt><dd>' + D.verdicts.FARM + ' farm · ' + D.verdicts.THIN + ' thin · ' + D.verdicts.SKIP + ' skip</dd></div>';
  }

  function renderModel() {
    var f = D.fit, b = D.backtest, dg = D.diagnostics;
    $('modelFormula').textContent = 'implied = 10^(' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(2) + ' × log10 TVL + category adj.) × growth × maturity';
    $('modelNote').innerHTML =
      'The curve is fitted on the snapshot&rsquo;s own ' + f.n_comps + ' live-token protocols (R² ' + f.r2.toFixed(2) +
      '): a dollar of TVL is worth less, in market cap, the bigger the protocol gets. Each category&rsquo;s ' +
      'adjustment is its median residual from the curve, shrunk toward zero and clamped to ±0.30. Growth is the ' +
      '7-day TVL change clamped to −80…+200% and dampened with a log, weight 0.5. Maturity runs 0.6 → 1.0 over ' +
      '3 years listed; no listing date counts as 1 year old. The tests below cover the curve&rsquo;s ' +
      'base value only; the growth and maturity multipliers are not backtested.';
    $('backtestLine').innerHTML =
      '<b>Tested out of sample.</b> 5-fold cross-validation on the ' + b.cv_n + ' comps: median error ' +
      b.cv_median_abs_log10.toFixed(2) + ' in log10 (a typical fitted value is off by about ' +
      Math.pow(10, b.cv_median_abs_log10).toFixed(1) + '&times;), ' + (b.cv_within_2x * 100).toFixed(0) + '% of held-out market caps ' +
      'predicted within a factor of two. Out-of-time split (fitted before ' + b.blind_cutoff + ', tested after): median ' +
      'predicted-to-actual ratio ' + b.blind_median_ratio.toFixed(2) + ', ' + (b.blind_within_2x * 100).toFixed(0) + '% within twofold on ' +
      b.blind_n + ' newer protocols. It beats a category-median multiple on the same folds (' +
      b.cv_median_abs_log10.toFixed(2) + ' vs ' + b.baseline_cv_median_abs_log10.toFixed(2) + ').';
    $('bandLine').innerHTML =
      '<b>The band.</b> ' + dg.bootstrap_draws + ' bootstrap refits of the curve on resampled comparables: ' +
      'the median 90% band is ' + dg.band_median_width_x.toFixed(1) + '&times; wide (high / low), so neighbours ' +
      'inside one band are close calls. Category multiples span ' + dg.cat_spread_dex.toFixed(2) + ' in log10 ' +
      'between the richest and cheapest categories — the adjustments in the chips below are that spread, shrunk and clamped.';
    var chips = Object.keys(D.cat_adjustments).sort(function (a, b) { return D.cat_adjustments[b] - D.cat_adjustments[a]; })
      .map(function (c) {
        var v = D.cat_adjustments[c];
        return '<span>' + esc(c) + ' <b>' + (v >= 0 ? '+' : '') + v.toFixed(2) + '</b></span>';
      }).join('');
    $('adjustments').innerHTML = chips + '<span>other categories <b>±0.00</b></span>';
  }

  function rowHtml(r) {
    var g = r[6];
    var band = bandOf(r[8], r[12]);
    var adj = catAdj(catName(r[3]));
    return '<tr data-slug="' + esc(r[1]) + '">' +
      '<td class="rank">' + r[0] + '</td>' +
      '<td><a class="name" href="#/p/' + esc(r[1]) + '">' + esc(r[2]) + '</a> <span class="slug">' + esc(r[1]) + '</span>' +
      (r[11] ? ' <span class="watch">WATCHLIST</span>' : '') + '</td>' +
      '<td>' + esc(catName(r[3]) === null ? '—' : catName(r[3])) + '</td>' +
      '<td>' + chainTags(r[4]) + '</td>' +
      '<td class="num">' + money(r[5]) + '</td>' +
      '<td class="num ' + pctClass(g) + '">' + pct(g) + '</td>' +
      '<td class="num">' + ageText(r[7]) + '</td>' +
      '<td class="num">' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + '</td>' +
      '<td class="num"><b>' + money(r[8]) + '</b><br><span class="band">' + money(band[0]) + '–' + money(band[1]) + '</span></td>' +
      '<td>' + verdictBadge(r[9]) + '</td>' +
      '<td class="num ' + (r[10] >= 0 ? 'up' : 'down') + '">' + moneySigned(r[10]) + '</td>' +
      '</tr>';
  }

  function renderBoard() {
    var rows = filteredRows();
    $('boardBody').innerHTML = rows.map(rowHtml).join('');
    $('boardCount').textContent = rows.length + ' of ' + D.rows.length + ' ranked protocols. Net is the farm\u2019s expected value per farmer at the low end of the band, after gas and opportunity cost. The range under each implied value is its 90% band.';
    var body = $('boardBody');
    Array.prototype.forEach.call(body.querySelectorAll('tr'), function (tr) {
      tr.addEventListener('click', function () { location.hash = '#/p/' + tr.getAttribute('data-slug'); });
    });
  }

  function renderLive() {
    $('liveBody').innerHTML = D.live.map(function (r, i) {
      var ratio = r[5] !== null && r[4] > 0 ? (r[5] / r[4]).toFixed(2) + '&times;' : '—';
      return '<tr><td class="rank">' + (i + 1) + '</td>' +
        '<td><span class="name">' + esc(r[1]) + '</span><br><span class="slug">' + esc(r[0]) + '</span></td>' +
        '<td>' + esc(r[2] === null ? '—' : r[2]) + '</td>' +
        '<td>' + chainTags(r[3]) + '</td>' +
        '<td class="num">' + money(r[4]) + '</td>' +
        '<td class="num">' + money(r[5]) + '</td>' +
        '<td class="num">' + ratio + '</td>' +
        '<td class="num ' + pctClass(r[6]) + '">' + pct(r[6]) + '</td></tr>';
    }).join('');
    $('anchorBody').innerHTML = D.anchors.map(function (a) {
      return '<tr><td>' + esc(a[0]) + '</td><td class="num">' + a[1] + ' tokens</td><td class="num">' + a[2].toFixed(3) + '&times;</td></tr>';
    }).join('');
  }

  function renderDetail(slug) {
    var r = null;
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i][1] === slug) { r = D.rows[i]; break; }
    var box = $('detailBody');
    if (!r) { box.innerHTML = '<p>No protocol with that slug is on the board.</p>'; return; }
    var g = r[6];
    var age = r[7] === null ? 365 : r[7];
    var hold = holdDays(r[7]);
    var cap = capitalFor(r[5]);
    var gas = gasFor(hold);
    var opp = Math.round(oppFor(cap * 1.5, hold) * 100) / 100;
    var base = Math.round(r[8] / (growthMult(g) * maturityMult(r[7])));
    var band = bandOf(r[8], r[12]);
    var adj = catAdj(catName(r[3]));
    var p = { name: r[2], category: catName(r[3]), chains: chainList(r[4]), tvl_usd: r[5], age_days: r[7] };
    var econ = { verdict: r[9], net: r[10], gross: Math.round((r[10] + gas + opp) * 100) / 100, farmers: farmersEst(r[5]) };
    var steps = farmStepsFor(p, econ);
    var stepsHtml = steps.map(function (s) {
      var cut = s.indexOf(' Cost: ');
      var text = cut >= 0 ? s.slice(0, cut) : s;
      var rest = cut >= 0 ? s.slice(cut + 1) : '';
      return '<li>' + esc(text) + ' <span class="cost"><b>' + esc(rest) + '</b></span></li>';
    }).join('');
    box.innerHTML =
      '<div class="detail-head"><h2>#' + r[0] + ' ' + esc(r[2]) + '</h2>' +
      '<span class="implied">' + moneyFull(r[8]) + ' implied</span>' +
      '<span class="band big">' + money(band[0]) + ' – ' + money(band[1]) + ' (90% band)</span>' +
      verdictBadge(r[9]) +
      (r[11] ? '<span class="watch">ON THE WATCHLIST</span>' : '') + '</div>' +
      '<dl class="detail-grid">' +
      '<div><dt>TVL</dt><dd>' + moneyFull(r[5]) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd class="' + pctClass(g) + '">' + pct(g) + '</dd></div>' +
      '<div><dt>Age listed</dt><dd>' + ageText(r[7]) + '</dd></div>' +
      '<div><dt>Category</dt><dd>' + esc(catName(r[3]) === null ? '—' : catName(r[3])) + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + chainTags(r[4]) + '</dd></div>' +
      '<div><dt>Token recorded</dt><dd>none</dd></div>' +
      '</dl>' +
      '<div class="farm"><h3>Farm plan — eight steps</h3><ol>' + stepsHtml + '</ol></div>' +
      '<div class="breakdown"><h3>Farm economics — netted to the dollar</h3>' +
      '<table><tbody>' +
      '<tr><td>Low-end pool — 5% of implied value</td><td class="num">' + moneyFull(r[8] * 0.05) + '</td></tr>' +
      '<tr><td>Farmers sharing it</td><td class="num">' + econ.farmers.toLocaleString('en-US') + '</td></tr>' +
      '<tr><td>Expected gross per farmer</td><td class="num">' + moneySigned(econ.gross) + '</td></tr>' +
      '<tr><td>Gas for the whole plan</td><td class="num">−' + moneyFull(gas) + '</td></tr>' +
      '<tr><td>Opportunity cost on $' + (cap * 1.5) + ' at work</td><td class="num">−$' + opp.toFixed(2) + '</td></tr>' +
      '<tr><td><b>Net per farmer</b></td><td class="num"><b>' + moneySigned(r[10]) + '</b></td></tr>' +
      '<tr><td><b>Verdict</b></td><td class="num">' + verdictBadge(r[9]) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="break-note">FARM clears $200 net, THIN clears $50, SKIP clears neither — all at the low end of ' +
      'the band, so a SKIP can still pay if the allocation lands above 5%.</p></div>' +
      '<div class="breakdown"><h3>How the implied value is built</h3>' +
      '<table><tbody>' +
      '<tr><td>Curve base — 10^(' + D.fit.intercept.toFixed(2) + ' + ' + D.fit.slope.toFixed(2) + ' × log10 TVL' + (adj !== 0 ? ' ' + (adj >= 0 ? '+' : '') + adj.toFixed(2) + ' adj.' : '') + ')</td><td class="num">' + moneyFull(base) + '</td></tr>' +
      '<tr><td>Growth (7d ' + pct(g) + ', log-dampened)</td><td class="num">&times; ' + growthMult(g).toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity (' + age + ' days listed)</td><td class="num">&times; ' + maturityMult(r[7]).toFixed(4) + '</td></tr>' +
      '<tr><td>90% band (' + D.diagnostics.bootstrap_draws + ' refits)</td><td class="num">' + money(band[0]) + ' – ' + money(band[1]) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + moneyFull(r[8]) + '</b></td></tr>' +
      '</tbody></table>' +
      '<p class="break-note">The band is the honest part: the curve&rsquo;s own refits disagree by about ' +
      D.diagnostics.band_median_width_x.toFixed(1) + '&times; on a typical protocol, so this rank is a close ' +
      'call against its neighbours.</p></div>' +
      '<div class="breakdown sandbox"><h3>What if — test the model yourself</h3>' +
      '<p class="break-note">Move the sliders: the value, gross and verdict recompute with the same ' +
      'model. These are your assumptions, not the board&rsquo;s — the board keeps the snapshot&rsquo;s 7-day change and the 5% low end.</p>' +
      '<label class="sand-ctl">7-day TVL change <input type="range" id="sbGrowth" min="-80" max="200" step="0.01" value="' + (g === null ? 0 : Math.round(Math.min(200, Math.max(-80, g)) * 100) / 100) + '"> <b id="sbGrowthVal">' + pct(g) + '</b></label>' +
      '<label class="sand-ctl">Airdrop share <input type="range" id="sbShare" min="5" max="15" step="1" value="5"> <b id="sbShareVal">5%</b></label>' +
      '<p class="sand-out">At your assumptions: <b id="sbImplied">' + moneyFull(r[8]) + '</b> implied · ' +
      '<b id="sbGross">' + moneySigned(econ.gross) + '</b> gross · <b id="sbNet">' + moneySigned(r[10]) + '</b> net · <span id="sbVerdict">' + verdictBadge(r[9]) + '</span></p></div>' +
      '<p class="note">This protocol records no token in DefiLlama&rsquo;s snapshot — that is not proof it ' +
      'has none, and nothing here predicts whether or when it issues one. The implied value is this ' +
      'radar&rsquo;s claim, from the snapshot&rsquo;s figures alone.</p>';
    // The sandbox: same constants as the model, the reader's growth and share.
    var sbG = $('sbGrowth'), sbS = $('sbShare');
    function recompute() {
      var gv = Number(sbG.value), sh = Number(sbS.value);
      var imp = Math.max(1, Math.round(base * growthMult(gv) * maturityMult(r[7])));
      var gross = imp * (sh / 100) / econ.farmers;
      var net = Math.round((gross - gas - opp) * 100) / 100;
      var verdict = net >= 200 ? 'FARM' : net >= 50 ? 'THIN' : 'SKIP';
      $('sbGrowthVal').textContent = pct(gv);
      $('sbShareVal').textContent = sh + '%';
      $('sbImplied').textContent = moneyFull(imp);
      $('sbGross').textContent = moneySigned(Math.round(gross * 100) / 100);
      $('sbNet').textContent = moneySigned(net);
      $('sbVerdict').innerHTML = verdictBadge(verdict);
    }
    sbG.addEventListener('input', recompute);
    sbS.addEventListener('input', recompute);
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

  /* ------------------------------------------------------------ controls */

  function fillSelects() {
    var cats = {}, chains = {};
    D.rows.forEach(function (r) {
      if (r[3] !== null) cats[catName(r[3])] = true;
      chainList(r[4]).forEach(function (c) { chains[c] = true; });
    });
    function opts(names, all, sel) {
      return '<option value="">' + all + '</option>' + Object.keys(names).sort().map(function (c) {
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
    var h = location.hash || '#/';
    var m;
    state.detail = null;
    state.view = 'board';
    if ((m = h.match(/^#\/p\/([^/]+)$/))) {
      state.detail = decodeURIComponent(m[1]);
    } else if (h === '#/live') {
      state.view = 'live';
    } else if ((m = h.match(/^#\/f\/chain\/(.+)$/))) {
      state.chain = decodeURIComponent(m[1]);
      state.cat = '';
      state.verdict = '';
    } else if ((m = h.match(/^#\/f\/verdict\/(.+)$/))) {
      state.verdict = decodeURIComponent(m[1]);
      state.cat = '';
      state.chain = '';
    } else if ((m = h.match(/^#\/f\/(.+)$/))) {
      state.cat = decodeURIComponent(m[1]);
      state.chain = '';
      state.verdict = '';
    } else {
      state.cat = '';
      state.chain = '';
      state.verdict = '';
    }
    fillSelects();
    render();
  }

  $('q').addEventListener('input', function (e) { state.q = e.target.value; if (!state.detail) renderBoard(); });
  function hashSel(id, prefix) {
    $(id).addEventListener('change', function (e) {
      location.hash = e.target.value ? prefix + encodeURIComponent(e.target.value) : '#/';
    });
  }
  hashSel('fCat', '#/f/');
  hashSel('fChain', '#/f/chain/');
  hashSel('fVerdict', '#/f/verdict/');
  $('fTvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); if (!state.detail) renderBoard(); });
  $('fWatch').addEventListener('change', function (e) { state.watch = e.target.checked; if (!state.detail) renderBoard(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; if (!state.detail) renderBoard(); });
  $('viewBoard').addEventListener('click', function () { location.hash = '#/'; });
  $('viewLive').addEventListener('click', function () { location.hash = '#/live'; });
  document.querySelectorAll('thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      state.sort = key === 'rank' ? 'implied' : key;
      $('sort').value = state.sort;
      renderBoard();
    });
  });

  window.addEventListener('hashchange', route);
  route();
})();
