// Token Radar's page: no framework, no network. Reads window.RADAR (dashboard/data.js),
// renders the board, the live-token view and one protocol's detail, and re-prices the board in
// the model sandbox. The farm plan is generated here from the same inputs as board.json, so the
// page and the board agree: category, chains, TVL and age, never a hand-written list of names.
//
// Row layout in data.js (RadarRow):
//   [rank, slug, name, category, chains, tvl_usd, change_7d, age_days,
//    implied_value_usd, growth_multiplier, maturity_multiplier, category_multiple]
// LiveRow: [slug, name, category, chains, tvl_usd, mcap_usd, change_7d]

(function () {
  'use strict';
  var D = window.RADAR;
  var WATCH = {};
  D.watchlist.forEach(function (s) { WATCH[s] = true; });

  /** The model, as the sandbox may change it. */
  var MODEL = D.model;
  var state = { view: 'board', q: '', cat: '', chain: '', minTvl: 0, sort: 'implied', detail: null, sandbox: null };

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

  /* ------------------------------------------------------------ the farm plan
     Self-contained: every helper lives inside, so the same function can be run
     in Node against board.json. The templates are the model's own, shared with
     lib/model.ts; the page and the board render the same six steps. */

  function farmStepsFor(p) {
    function chainOf() { return p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
    function capitalFor() {
      if (p.tvl_usd >= 5000000000) return 250;
      if (p.tvl_usd >= 1000000000) return 150;
      if (p.tvl_usd >= 100000000) return 100;
      return 50;
    }
    function holdDaysFor() {
      if (p.age_days === null || p.age_days === undefined) return 30;
      if (p.age_days < 180) return 60;
      if (p.age_days < 365) return 45;
      return 30;
    }
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
    var capital = capitalFor();
    var hold = holdDaysFor();
    var action = actionFor(capital, chain);
    var secondChain = p.chains.length > 1 ? p.chains[1] : null;
    var depth = secondChain !== null
      ? 'Repeat the core position on ' + secondChain + ' with half the capital, so the farm covers two chains.'
      : ((p.category || '').toLowerCase().indexOf('lend') >= 0 || (p.category || '').toLowerCase().indexOf('cdp') >= 0)
        ? 'Borrow a small amount against the deposit and loop it once, keeping the health factor above 2.'
        : 'Open a second, smaller position in the protocol\'s other main feature to widen the footprint.';
    return [
      { text: 'Set aside a clean wallet for this farm alone, fund it with only the capital below, and store its recovery phrase offline on paper.', cost: 'about $2 in gas to fund it', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital plus about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: depth, cost: 'about half the capital again and $3 of gas', time: '10 minutes' },
      { text: 'Do one real action every week, a deposit, a swap, a vote or a borrow, and never leave the wallet idle for a full month.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days and check ' + p.name + '\'s points or rewards page weekly; only claim through links the protocol itself publishes.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: 'Log the wallet address, the dates and every transaction hash, and plan the exit now: unwind in two steps if the token launches, and never pay anyone to claim for you.', cost: 'nothing but the log', time: '5 minutes to log, 15 to unwind' },
    ].map(stepText);
  }

  /* ------------------------------------------------------------ the model, live */

  /** One row's implied value under the sandbox's constants, else its stored value. */
  function displayValue(r) {
    if (!state.sandbox) return r[8];
    var sb = state.sandbox;
    var g = r[6] === null || r[6] === undefined ? 0 : Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, r[6]));
    var gm = 1 + sb.gw * (g < 0 ? -1 : g > 0 ? 1 : 0) * (Math.log(1 + Math.abs(g) / MODEL.growth_log_scale) / Math.log(MODEL.growth_log_norm));
    var age = r[7] === null || r[7] === undefined ? MODEL.unknown_age_days : r[7];
    var mm = sb.mf + (1 - sb.mf) * (Math.min(Math.max(age, 0), MODEL.maturity_days) / MODEL.maturity_days);
    return Math.max(1, Math.round(r[5] * r[11] * sb.ms * gm * mm));
  }
  function baseValue(r) { return Math.round(r[5] * r[11]); }

  /* ------------------------------------------------------------ filtering */

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.cat && r[3] !== state.cat) return false;
      if (state.chain && r[4].indexOf(state.chain) < 0) return false;
      if (state.minTvl && r[5] < state.minTvl) return false;
      if (q && r[2].toLowerCase().indexOf(q) < 0 && r[1].toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      if (key === 'tvl') return b[5] - a[5] || a[0] - b[0];
      if (key === 'growth') return (b[6] === null ? -1e9 : b[6]) - (a[6] === null ? -1e9 : a[6]) || a[0] - b[0];
      if (key === 'age') return ((b[7] === null ? -1 : b[7]) - (a[7] === null ? -1 : a[7])) || a[0] - b[0];
      return displayValue(b) - displayValue(a) || a[0] - b[0];
    });
    return rows;
  }

  /* ------------------------------------------------------------ rendering */

  var $ = function (id) { return document.getElementById(id); };

  function renderStats() {
    var total = D.rows.reduce(function (n, r) { return n + displayValue(r); }, 0);
    $('asOf').textContent = D.as_of;
    $('srcLine').textContent = D.source;
    $('stats').innerHTML =
      '<div><dt>Protocols</dt><dd>' + D.rows.length + ' <em>ranked</em></dd></div>' +
      '<div><dt>Watchlist</dt><dd>' + D.watchlist_size + ' covered</dd></div>' +
      '<div><dt>Early finds</dt><dd>' + D.early_size + ' below floor</dd></div>' +
      '<div><dt>Live, set aside</dt><dd>' + D.live_size + '</dd></div>' +
      '<div><dt>Combined implied</dt><dd>' + money(total) + '</dd></div>';
  }

  function renderMultiples() {
    var chips = Object.keys(D.multiples).sort(function (a, b) { return D.multiples[b] - D.multiples[a]; })
      .map(function (c) { return '<span>' + esc(c) + ' <b>' + D.multiples[c].toFixed(2) + '&times;</b></span>'; })
      .join('');
    $('multiples').innerHTML = chips + '<span>all live <b>' + D.overall_multiple.toFixed(2) + '&times;</b></span>';
  }

  function rowHtml(r) {
    var v = displayValue(r);
    var g = r[6];
    return '<tr data-slug="' + esc(r[1]) + '">' +
      '<td class="rank">' + r[0] + '</td>' +
      '<td><span class="name">' + esc(r[2]) + '</span><br><span class="slug">' + esc(r[1]) + '</span>' +
      (WATCH[r[1]] ? ' <span class="watch">WATCHLIST</span>' : '') + '</td>' +
      '<td>' + esc(r[3] === null ? '—' : r[3]) + '</td>' +
      '<td>' + r[4].map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + '</td>' +
      '<td class="num">' + money(r[5]) + '</td>' +
      '<td class="num ' + pctClass(g) + '">' + pct(g) + '</td>' +
      '<td class="num">' + ageText(r[7]) + '</td>' +
      '<td class="num">' + r[11].toFixed(2) + '&times;</td>' +
      '<td class="num"><b>' + money(v) + '</b></td>' +
      '</tr>';
  }

  function renderBoard() {
    var rows = filteredRows();
    $('boardBody').innerHTML = rows.map(rowHtml).join('');
    $('boardCount').textContent = rows.length + ' of ' + D.rows.length + ' ranked protocols' +
      (state.sandbox ? ' — sandbox pricing on (the ranked board in board.json is unchanged)' : '') + '.';
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
        '<td>' + r[3].map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') + '</td>' +
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
    var v = displayValue(r);
    var base = baseValue(r);
    var g = r[6];
    var age = r[7] === null ? MODEL.unknown_age_days : r[7];
    var p = { name: r[2], category: r[3], chains: r[4], tvl_usd: r[5], age_days: r[7] };
    var steps = farmStepsFor(p);
    var stepsHtml = steps.map(function (s) {
      var cut = s.indexOf(' Cost: ');
      var text = cut >= 0 ? s.slice(0, cut) : s;
      var rest = cut >= 0 ? s.slice(cut + 1) : '';
      return '<li>' + esc(text) + ' <span class="cost"><b>' + esc(rest) + '</b></span></li>';
    }).join('');
    box.innerHTML =
      '<div class="detail-head"><h2>#' + r[0] + ' ' + esc(r[2]) + '</h2>' +
      '<span class="implied">' + moneyFull(v) + ' implied</span>' +
      (WATCH[r[1]] ? '<span class="watch">ON THE WATCHLIST</span>' : '') + '</div>' +
      '<dl class="detail-grid">' +
      '<div><dt>TVL</dt><dd>' + moneyFull(r[5]) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd class="' + pctClass(g) + '">' + pct(g) + '</dd></div>' +
      '<div><dt>Age listed</dt><dd>' + ageText(r[7]) + '</dd></div>' +
      '<div><dt>Category</dt><dd>' + esc(r[3] === null ? '—' : r[3]) + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + esc(r[4].join(', ') || '—') + '</dd></div>' +
      '<div><dt>Token recorded</dt><dd>none</dd></div>' +
      '</dl>' +
      '<div class="breakdown"><h3>How the implied value is built</h3>' +
      '<table><tbody>' +
      '<tr><td>TVL &times; category multiple</td><td class="num">' + moneyFull(r[5]) + ' &times; ' + r[11].toFixed(4) + ' = ' + moneyFull(base) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + pct(g) + ', log-dampened)</td><td class="num">&times; ' + r[9].toFixed(4) + '</td></tr>' +
      '<tr><td>Maturity multiplier (' + age + ' days listed)</td><td class="num">&times; ' + r[10].toFixed(4) + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num"><b>' + moneyFull(v) + '</b></td></tr>' +
      '</tbody></table></div>' +
      '<div class="farm"><h3>Farm plan — six steps</h3><ol>' + stepsHtml + '</ol></div>' +
      '<p class="note">This protocol records no token in DefiLlama&rsquo;s snapshot — that is not proof it ' +
      'has none, and nothing here predicts whether or when it issues one. The implied value is this ' +
      'radar&rsquo;s claim, from the snapshot&rsquo;s figures alone.</p>';
  }

  function render() {
    renderStats();
    renderMultiples();
    var detail = state.detail !== null;
    $('boardView').hidden = detail || state.view !== 'board';
    $('liveView').hidden = detail || state.view !== 'live';
    $('detailView').hidden = !detail;
    $('viewBoard').className = state.view === 'board' && !detail ? 'on' : '';
    $('viewLive').className = state.view === 'live' && !detail ? 'on' : '';
    if (detail) renderDetail(state.detail);
    else if (state.view === 'board') renderBoard();
    else renderLive();
    $('sandboxTag').textContent = state.sandbox ? 'ON — re-pricing the board live' : 'off — the board below uses the stated model';
    $('sandboxTag').className = 'sandbox-tag' + (state.sandbox ? ' live' : '');
  }

  /* ------------------------------------------------------------ controls */

  function fillSelects() {
    var cats = {}, chains = {};
    D.rows.forEach(function (r) {
      if (r[3] !== null) cats[r[3]] = true;
      r[4].forEach(function (c) { chains[c] = true; });
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
    } else if ((m = h.match(/^#\/f\/(.+)$/))) {
      state.detail = null;
      state.view = 'board';
      state.cat = decodeURIComponent(m[1]);
      state.chain = '';
    } else {
      state.detail = null;
      state.view = 'board';
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

  function sandboxChanged() {
    var gw = Number($('sbGrowth').value);
    var mf = Number($('sbMaturity').value);
    var ms = Number($('sbMultiple').value);
    $('sbGrowthOut').textContent = gw.toFixed(2);
    $('sbMaturityOut').textContent = mf.toFixed(2);
    $('sbMultipleOut').textContent = ms.toFixed(1) + '×';
    var def = gw === 0.5 && mf === 0.6 && ms === 1;
    state.sandbox = def ? null : { gw: gw, mf: mf, ms: ms };
    render();
  }
  $('sbGrowth').addEventListener('input', sandboxChanged);
  $('sbMaturity').addEventListener('input', sandboxChanged);
  $('sbMultiple').addEventListener('input', sandboxChanged);
  $('sbReset').addEventListener('click', function () {
    $('sbGrowth').value = '0.5';
    $('sbMaturity').value = '0.6';
    $('sbMultiple').value = '1';
    sandboxChanged();
  });

  window.addEventListener('hashchange', route);
  route();
})();
