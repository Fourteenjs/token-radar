// Token Radar's page: no framework, no network. Reads window.RADAR (dashboard/data.js) and
// renders the board, the live-token view and one protocol's detail. The farm plan is generated
// here from the same inputs as board.json, so the page and the board agree: category, chains,
// TVL, age and the stored verdict and net, never a hand-written list of names.
//
// Row layout in data.js (RadarRow):
//   [rank, slug, name, category, chains (comma-joined), tvl_usd, change_7d, age_days,
//    implied_value_usd, category_adjustment, verdict, net_usd, on_watchlist]
// Growth and maturity multipliers, the farmer crowd, the gas and the opportunity cost are
// re-derived here from change_7d, age_days, TVL and net with the model's own constants.

(function () {
  'use strict';
  var D = window.RADAR;
  var state = { view: 'board', q: '', cat: '', chain: '', verdict: '', minTvl: 0, sort: 'implied', detail: null };

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
  /** A signed dollar figure: −$123 for a loss, $123 otherwise. */
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
  /** The first three chains as tags, the rest counted. */
  function chainTags(chains) {
    var list = typeof chains === 'string' ? chains.split(',') : chains;
    var shown = list.slice(0, 3).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('');
    return list.length > 3 ? shown + '<span class="tag">+' + (list.length - 3) + '</span>' : shown;
  }

  /* The model, re-derived with the constants lib/model.ts states: growth clamped to
     -80..+200%, log-dampened, weight 0.5; maturity 0.6 to 1.0 over 3 years, unknown age 365d;
     farmers 800 x (TVL / $1M)^0.35, 500..120000; gas $4 + $8 + $3 + $6 + $2/week, max 8 weeks;
     opportunity cost 5% a year on the capital over the hold. */

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

  /* The farm plan. The templates are the model's own, shared with lib/model.ts; the page and
     the board render the same seven steps. */

  function farmStepsFor(p, econ) {
    function chainOf() { return p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
    function capitalForRow() { return capitalFor(p.tvl_usd); }
    function holdDaysRow() { return holdDays(p.age_days); }
    function actionFor(capital, chain) {
      var c = (p.category || '').toLowerCase();
      var name = p.name;
      if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC into ' + name + '\'s ' + chain + ' market and leave the deposit earning.';
      if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + '\'s deepest pool on ' + chain + ' and hold the LP position.';
      if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
      if (c.indexOf('prediction') >= 0) return 'Back one outcome with $' + capital + ' on ' + name + ' and keep the position through settlement.';
      if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' and hold it.';
      if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset issued through ' + name + ' on ' + chain + '.';
      if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('index') >= 0 || c.indexOf('aggregator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
      if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
      if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' through ' + name + ' and put the bridged funds to work in its app.';
      if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.';
      return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    }
    function stepText(step) {
      var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
      if (s.length > 600) s = s.slice(0, 596) + '...';
      if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
      return s;
    }
    var chain = chainOf();
    var capital = capitalForRow();
    var hold = holdDaysRow();
    var action = actionFor(capital, chain);
    var secondChain = p.chains.length > 1 ? p.chains[1] : null;
    var depth = secondChain !== null
      ? 'Repeat the core position on ' + secondChain + ' with half the capital, so the farm covers two chains.'
      : 'Add a second, smaller deposit to the protocol\'s other main market to widen the footprint.';
    var gas = gasFor(hold);
    var opp = Math.round(oppFor(capital * 1.5, hold) * 100) / 100;
    var verdictLine = econ.verdict === 'FARM'
      ? 'Verdict: FARM — at the low end of the band (5% of the implied value shared among about ' + econ.farmers.toLocaleString('en-US') + ' farmers) this farm expects about $' + econ.gross.toFixed(0) + ' gross per farmer, a net of about $' + econ.net.toFixed(0) + ' after costs.'
      : econ.verdict === 'THIN'
        ? 'Verdict: THIN — at the low end of the band (5% of the implied value shared among about ' + econ.farmers.toLocaleString('en-US') + ' farmers) this farm expects about $' + econ.gross.toFixed(0) + ' gross per farmer, a net of about $' + econ.net.toFixed(0) + ' after costs: worth it only if you are already on the chain.'
        : 'Verdict: SKIP — at the low end of the band (5% of the implied value shared among about ' + econ.farmers.toLocaleString('en-US') + ' farmers) this farm expects about $' + econ.gross.toFixed(0) + ' gross per farmer, a net of about $' + econ.net.toFixed(0) + ' after costs: the low end does not pay for the farm.';
    return [
      { text: 'Set aside a clean wallet for this farm alone, fund it with only the capital below, and store its recovery phrase offline on paper.', cost: 'about $4 in gas to fund it', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital plus about $8 of gas', time: '15 minutes to set up' },
      { text: depth, cost: 'about half the capital again and $3 of gas', time: '10 minutes' },
      { text: 'Do one real action every week, a deposit, a swap, a vote or a borrow, and never leave the wallet idle for a full month.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days and check ' + p.name + '\'s points or rewards page weekly; only claim through links the protocol itself publishes.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: verdictLine, cost: 'about $' + gas + ' of gas plus $' + opp.toFixed(2) + ' of opportunity cost on the capital', time: hold + ' days' },
      { text: 'Log the wallet address, the dates and every transaction hash, and plan the exit now: unwind in two steps if the token launches, and never pay anyone to claim for you.', cost: 'about $6 of gas to unwind', time: '5 minutes to log, 15 to unwind' },
    ].map(stepText);
  }

  /* ------------------------------------------------------------ filtering */

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.cat && r[3] !== state.cat) return false;
      if (state.chain && r[4].split(',').indexOf(state.chain) < 0) return false;
      if (state.verdict && r[10] !== state.verdict) return false;
      if (state.minTvl && r[5] < state.minTvl) return false;
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b[5] - a[5] || a[0] - b[0];
      if (key === 'growth') return (b[6] === null ? -1e9 : b[6]) - (a[6] === null ? -1e9 : a[6]) || a[0] - b[0];
      if (key === 'age') return ((b[7] === null ? -1 : b[7]) - (a[7] === null ? -1 : a[7])) || a[0] - b[0];
      if (key === 'net') return b[11] - a[11] || a[0] - b[0];
      return b[8] - a[8] || a[0] - b[0];
    });
    return rows;
  }

  /* ------------------------------------------------------------ rendering */

  var $ = function (id) { return document.getElementById(id); };

  function renderStats() {
    var total = D.rows.reduce(function (n, r) { return n + r[8]; }, 0);
    $('asOf').textContent = D.as_of;
    $('srcLine').textContent = D.source;
    $('stats').innerHTML =
      '<div><dt>Protocols</dt><dd>' + D.rows.length + ' <em>ranked</em></dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + D.watchlist_size + ' covered</dd></div>' +
      '<div><dt>Audited</dt><dd>' + D.audit.pre_token + ' pre-token</dd></div>' +
      '<div><dt>Comps</dt><dd>' + D.fit.n_comps + ' live tokens</dd></div>' +
      '<div><dt>Verdicts</dt><dd>' + D.verdicts.FARM + ' farm · ' + D.verdicts.THIN + ' thin · ' + D.verdicts.SKIP + ' skip</dd></div>' +
      '<div><dt>Combined implied</dt><dd>' + money(total) + '</dd></div>';
  }

  function renderModel() {
    var f = D.fit, b = D.backtest;
    $('modelFormula').textContent = 'implied = 10^(' + f.intercept.toFixed(2) + ' + ' + f.slope.toFixed(2) + ' × log10 TVL + category adj.) × growth × maturity';
    $('modelNote').innerHTML =
      'The curve is fitted on the snapshot&rsquo;s own ' + f.n_comps + ' live-token protocols (R² ' + f.r2.toFixed(2) +
      '): a dollar of TVL is worth less, in market cap, the bigger the protocol gets. Each category&rsquo;s ' +
      'adjustment is its median residual from the curve, shrunk toward zero and clamped to ±0.30. Growth is the ' +
      '7-day TVL change clamped to −80…+200% and dampened with a log, weight 0.5. Maturity runs 0.6 → 1.0 over ' +
      '3 years listed; a protocol with no listing date counts as 1 year old. The tests below cover the curve&rsquo;s ' +
      'base value only; the growth and maturity multipliers are not backtested.';
    $('backtestLine').innerHTML =
      '<b>Tested out of sample.</b> 5-fold cross-validation on the ' + b.cv_n + ' comps: median error ' +
      b.cv_median_abs_log10.toFixed(2) + ' in log10 (a typical fitted value is off by about ' +
      Math.pow(10, b.cv_median_abs_log10).toFixed(1) + '&times;), ' + (b.cv_within_2x * 100).toFixed(0) + '% of held-out market caps ' +
      'predicted within a factor of two. Out-of-time split (fitted before ' + b.blind_cutoff + ', tested after): median ' +
      'predicted-to-actual ratio ' + b.blind_median_ratio.toFixed(2) + ', ' + (b.blind_within_2x * 100).toFixed(0) + '% within twofold on ' +
      b.blind_n + ' newer protocols. It beats a category-median multiple on the same folds (' +
      b.cv_median_abs_log10.toFixed(2) + ' vs ' + b.baseline_cv_median_abs_log10.toFixed(2) + ').';
    var chips = Object.keys(D.cat_adjustments).sort(function (a, b) { return D.cat_adjustments[b] - D.cat_adjustments[a]; })
      .map(function (c) {
        var v = D.cat_adjustments[c];
        return '<span>' + esc(c) + ' <b>' + (v >= 0 ? '+' : '') + v.toFixed(2) + '</b></span>';
      }).join('');
    $('adjustments').innerHTML = chips + '<span>other categories <b>±0.00</b></span>';
  }

  function rowHtml(r) {
    var g = r[6];
    return '<tr data-slug="' + esc(r[1]) + '">' +
      '<td class="rank">' + r[0] + '</td>' +
      '<td><a class="name" href="#/p/' + esc(r[1]) + '">' + esc(r[2]) + '</a><br><span class="slug">' + esc(r[1]) + '</span>' +
      (r[12] ? ' <span class="watch">WATCHLIST</span>' : '') + '</td>' +
      '<td>' + esc(r[3] === null ? '—' : r[3]) + '</td>' +
      '<td>' + chainTags(r[4]) + '</td>' +
      '<td class="num">' + money(r[5]) + '</td>' +
      '<td class="num ' + pctClass(g) + '">' + pct(g) + '</td>' +
      '<td class="num">' + ageText(r[7]) + '</td>' +
      '<td class="num">' + (r[9] >= 0 ? '+' : '') + r[9].toFixed(2) + '</td>' +
      '<td class="num"><b>' + money(r[8]) + '</b></td>' +
      '<td>' + verdictBadge(r[10]) + '</td>' +
      '<td class="num ' + (r[11] >= 0 ? 'up' : 'down') + '">' + moneySigned(r[11]) + '</td>' +
      '</tr>';
  }

  function renderBoard() {
    var rows = filteredRows();
    $('boardBody').innerHTML = rows.map(rowHtml).join('');
    $('boardCount').textContent = rows.length + ' of ' + D.rows.length + ' ranked protocols. Net is the farm\u2019s expected value per farmer at the low end of the band, after gas and opportunity cost.';
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
    // The curve base is backed out of the stored implied value, so the breakdown multiplies
    // back to it exactly; the fitted coefficients in data.js are rounded to 6 places.
    var base = Math.round(r[8] / (growthMult(g) * maturityMult(r[7])));
    var p = { name: r[2], category: r[3], chains: r[4].split(','), tvl_usd: r[5], age_days: r[7] };
    var econ = { verdict: r[10], net: r[11], gross: Math.round((r[11] + gas + opp) * 100) / 100, farmers: farmersEst(r[5]) };
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
      verdictBadge(r[10]) +
      (r[12] ? '<span class="watch">ON THE WATCHLIST</span>' : '') + '</div>' +
      '<dl class="detail-grid">' +
      '<div><dt>TVL</dt><dd>' + moneyFull(r[5]) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd class="' + pctClass(g) + '">' + pct(g) + '</dd></div>' +
      '<div><dt>Age listed</dt><dd>' + ageText(r[7]) + '</dd></div>' +
      '<div><dt>Category</dt><dd>' + esc(r[3] === null ? '—' : r[3]) + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + esc(r[4].split(',').join(', ') || '—') + '</dd></div>' +
      '<div><dt>Token recorded</dt><dd>none</dd></div>' +
      '</dl>' +
      '<div class="breakdown"><h3>How the implied value is built</h3>' +
      '<table><tbody>' +
      '<tr><td>Curve base — 10^(' + D.fit.intercept.toFixed(2) + ' + ' + D.fit.slope.toFixed(2) + ' × log10 TVL' + (r[9] !== 0 ? ' ' + (r[9] >= 0 ? '+' : '') + r[9].toFixed(2) + ' adj.' : '') + ')</td><td class="num">' + moneyFull(base) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + pct(g) + ', log-dampened)</td><td class="num">&times; ' + growthMult(g).toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + age + ' days listed)</td><td class="num">&times; ' + maturityMult(r[7]).toFixed(4) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + moneyFull(r[8]) + '</b></td></tr>' +
      '</tbody></table></div>' +
      '<div class="breakdown"><h3>Farm economics — netted to the dollar</h3>' +
      '<table><tbody>' +
      '<tr><td>Low-end airdrop pool (5% of implied value)</td><td class="num">' + moneyFull(r[8] * 0.05) + '</td></tr>' +
      '<tr><td>Farmers sharing it (est.)</td><td class="num">' + econ.farmers.toLocaleString('en-US') + '</td></tr>' +
      '<tr><td>Expected gross per farmer</td><td class="num">' + moneySigned(econ.gross) + '</td></tr>' +
      '<tr><td>Gas for the whole plan</td><td class="num">−' + moneyFull(gas) + '</td></tr>' +
      '<tr><td>Opportunity cost on $' + (cap * 1.5) + ' of capital at work</td><td class="num">−$' + opp.toFixed(2) + '</td></tr>' +
      '<tr><td><b>Net per farmer</b></td><td class="num"><b>' + moneySigned(r[11]) + '</b></td></tr>' +
      '<tr><td><b>Verdict</b></td><td class="num">' + verdictBadge(r[10]) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="break-note">FARM clears $200 net, THIN clears $50, SKIP clears neither — all at the low end of ' +
      'the band, so a SKIP can still pay if the allocation lands above 5%. The verdict prices the farm, not the ' +
      'rank: a big protocol can be a thin farm when its growth has stalled and its farmer crowd is large.</p></div>' +
      '<div class="farm"><h3>Farm plan — seven steps</h3><ol>' + stepsHtml + '</ol></div>' +
      '<p class="note">This protocol records no token in DefiLlama&rsquo;s snapshot — that is not proof it ' +
      'has none, and nothing here predicts whether or when it issues one. The implied value is this ' +
      'radar&rsquo;s claim, from the snapshot&rsquo;s figures alone.</p>';
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
      if (r[3] !== null) cats[r[3]] = true;
      r[4].split(',').forEach(function (c) { chains[c] = true; });
    });
    var catOpts = '<option value="">All categories</option>' + Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="">All chains</option>' + Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    $('fCat').innerHTML = catOpts;
    $('fChain').innerHTML = chainOpts;
    $('q').value = state.q;
    $('fTvl').value = String(state.minTvl);
    $('fVerdict').value = state.verdict;
    $('sort').value = state.sort;
  }

  function route() {
    var h = location.hash || '#/';
    var m;
    if ((m = h.match(/^#\/p\/([^/]+)$/))) {
      state.detail = decodeURIComponent(m[1]);
      state.view = 'board';
    } else if (h === '#/live') {
      state.detail = null;
      state.view = 'live';
    } else if ((m = h.match(/^#\/f\/chain\/(.+)$/))) {
      state.detail = null;
      state.view = 'board';
      state.chain = decodeURIComponent(m[1]);
      state.cat = '';
      state.verdict = '';
    } else if ((m = h.match(/^#\/f\/verdict\/(.+)$/))) {
      state.detail = null;
      state.view = 'board';
      state.verdict = decodeURIComponent(m[1]);
      state.cat = '';
      state.chain = '';
    } else if ((m = h.match(/^#\/f\/(.+)$/))) {
      state.detail = null;
      state.view = 'board';
      state.cat = decodeURIComponent(m[1]);
      state.chain = '';
      state.verdict = '';
    } else {
      state.detail = null;
      state.view = 'board';
      state.cat = '';
      state.chain = '';
      state.verdict = '';
    }
    fillSelects();
    render();
  }

  $('q').addEventListener('input', function (e) { state.q = e.target.value; if (!state.detail) renderBoard(); });
  $('fCat').addEventListener('change', function (e) {
    location.hash = e.target.value ? '#/f/' + encodeURIComponent(e.target.value) : '#/';
  });
  $('fChain').addEventListener('change', function (e) {
    location.hash = e.target.value ? '#/f/chain/' + encodeURIComponent(e.target.value) : '#/';
  });
  $('fVerdict').addEventListener('change', function (e) {
    location.hash = e.target.value ? '#/f/verdict/' + encodeURIComponent(e.target.value) : '#/';
  });
  $('fTvl').addEventListener('change', function (e) { state.minTvl = Number(e.target.value); if (!state.detail) renderBoard(); });
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
