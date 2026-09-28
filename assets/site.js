// Single place to change the deployed app URL / repo coordinates.
window.S4CUS = {
  // The Flutter web app deployment every "Open the app" button points at.
  appUrl: 'https://trakerweb.vercel.app/',
  repo: 'YannErmes/timetraker',
  releasesApi: 'https://api.github.com/repos/YannErmes/timetraker/releases?per_page=50',
};

(function () {
  'use strict';

  var CFG = window.S4CUS;

  // Platform metadata keyed by the asset-name patterns the release workflow
  // produces. Older releases only shipped `app-release.apk`, which matches the
  // Android pattern, so they still show a download.
  var PLATFORMS = [
    { id: 'web', label: 'Web', icon: '🌐', test: /-web\.zip$/i },
    { id: 'android', label: 'Android', icon: '🤖', test: /\.apk$/i },
    { id: 'windows', label: 'Windows', icon: '🪟', test: /windows\.zip$/i },
    { id: 'ios', label: 'iOS', icon: '🍎', test: /\.ipa$/i },
  ];

  function pickPlatform(name) {
    for (var i = 0; i < PLATFORMS.length; i++) {
      if (PLATFORMS[i].test.test(name)) return PLATFORMS[i];
    }
    return null;
  }

  function mb(bytes) {
    if (!bytes) return '';
    return (bytes / 1048576).toFixed(bytes > 10485760 ? 0 : 1) + ' MB';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Deliberately tiny markdown subset for release notes. Everything is escaped
  // first, so nothing from the API can inject markup.
  function md(src) {
    if (!src) return '';
    var out = [];
    var lines = esc(src).split(/\r?\n/);
    var inList = false;
    var inTable = false;

    function inline(s) {
      return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    }

    function closeList() {
      if (inList) { out.push('</ul>'); inList = false; }
    }
    function closeTable() {
      if (inTable) { out.push('</tbody></table>'); inTable = false; }
    }

    // GitHub release bodies are hard-wrapped, so consecutive plain lines are one
    // paragraph. Without this buffer every wrapped line became its own <p>.
    var para = [];
    function flushPara() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*\|/.test(line)) {
        flushPara();
        var cells = line.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        if (/^[\s|:-]+$/.test(line)) continue; // separator row
        if (!inTable) {
          closeList();
          out.push('<table><thead><tr>' + cells.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>');
          inTable = true;
        } else {
          out.push('<tr>' + cells.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>');
        }
        continue;
      }
      closeTable();
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { flushPara(); closeList(); out.push('<h3>' + inline(h[2]) + '</h3>'); continue; }
      if (/^\s*>\s?/.test(line)) { flushPara(); closeList(); out.push('<blockquote>' + inline(line.replace(/^\s*>\s?/, '')) + '</blockquote>'); continue; }
      if (/^\s*[-*]\s+/.test(line)) {
        flushPara();
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>');
        continue;
      }
      if (!line.trim()) { flushPara(); closeList(); continue; }
      closeList();
      para.push(line.trim());
    }
    flushPara();
    closeList();
    closeTable();
    return out.join('');
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(document.documentElement.lang || 'en', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function assetLinks(release) {
    var byId = {};
    (release.assets || []).forEach(function (a) {
      var p = pickPlatform(a.name);
      if (!p) return;
      if (!byId[p.id] || /\.apk$/i.test(a.name)) byId[p.id] = a;
    });
    return PLATFORMS.filter(function (p) { return byId[p.id]; }).map(function (p) {
      var a = byId[p.id];
      return '<a class="dl" href="' + esc(a.browser_download_url) + '" rel="noopener">' +
        p.icon + ' ' + esc(p.label) + ' <span class="sz">' + esc(mb(a.size)) + '</span></a>';
    }).join('');
  }

  function releaseCard(r, isLatest) {
    var ver = (r.name || r.tag_name || '').trim() || r.tag_name;
    return '<article class="rel">' +
      '<div class="rel-head">' +
        '<span class="v">' + esc(ver) + '</span>' +
        (isLatest ? '<span class="tag">Latest</span>' : '') +
        (r.prerelease ? '<span class="tag pre">Pre-release</span>' : '') +
        '<time datetime="' + esc(r.published_at || '') + '">' + esc(fmtDate(r.published_at)) + '</time>' +
        '<div class="dls">' + assetLinks(r) + '</div>' +
      '</div>' +
      '<div class="rel-body">' + md(r.body) + '</div>' +
    '</article>';
  }

  function render(el, opts) {
    opts = opts || {};
    el.innerHTML = '<p class="loading">Loading versions…</p>';
    fetch(CFG.releasesApi, { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (releases) {
        var list = (releases || []).filter(function (r) { return !r.draft; });
        if (!list.length) {
          el.innerHTML = '<p class="empty">No published version yet.</p>';
          return;
        }
        var limit = opts.limit || 50;
        var html = list.slice(0, limit).map(function (r, i) { return releaseCard(r, i === 0); }).join('');
        if (list.length > limit) {
          html += '<p class="empty">Showing the ' + limit + ' most recent versions. <a href="https://github.com/' + esc(CFG.repo) + '/releases">See all on GitHub</a>.</p>';
        }
        el.innerHTML = html;
        if (opts.onDone) opts.onDone(list);
      })
      .catch(function (err) {
        el.innerHTML = '<p class="empty">Could not load the version list (' + esc(err.message) + '). ' +
          'All builds are also on <a href="https://github.com/' + esc(CFG.repo) + '/releases" rel="noopener">the GitHub releases page</a>.</p>';
      });
  }

  window.S4CUS.site = { render: render, md: md, esc: esc, fmtDate: fmtDate, mountScreens: mountScreens };

  // ------------------------------------------------------------------
  // CSS product screens. Keeps the site self-contained: no screenshot
  // files required. Drop a real PNG in assets/shots/ and swap the div
  // for an <img> whenever you want the actual app.
  // ------------------------------------------------------------------
  var COPY = {
    en: {
      bar: '4cus', plan: 'planned', done: 'done', prog: 'in progress', rest: 'rest', skip: 'skipped',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      tasks: ['Deep work', 'Gym', 'Client call', 'Reading', 'Weekly review'],
      month: 'September',
      total: 'Total', doneK: 'Done', plannedT: 'Time planned', actualT: 'Time done',
      timePerTask: 'Time per task', labels: { total: 'Total', done: 'Done', prog: 'In progress', left: 'Left' }
    },
    fr: {
      bar: '4cus', plan: 'prévu', done: 'fait', prog: 'en cours', rest: 'repos', skip: 'sauté',
      days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
      tasks: ['Travail de fond', 'Sport', 'Appel client', 'Lecture', 'Bilan de semaine'],
      month: 'Septembre',
      total: 'Total', doneK: 'Fait', plannedT: 'Temps prévu', actualT: 'Temps fait',
      timePerTask: 'Temps par tâche', labels: { total: 'Total', done: 'Fait', prog: 'En cours', left: 'Restant' }
    }
  };

  function copy() { return (document.documentElement.lang || 'en').indexOf('fr') === 0 ? COPY.fr : COPY.en; }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function pill(kind, text) { return '<span class="pill p-' + kind + '">' + esc(text) + '</span>'; }

  function screenBar(title) {
    var bar = el('div', 'sc-bar');
    bar.appendChild(el('i')); bar.appendChild(el('i')); bar.appendChild(el('i'));
    bar.appendChild(el('b', null, esc(title)));
    return bar;
  }

  // Deterministic pseudo-random so the mock never reshuffles between loads.
  function seeded(i) { var x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); }

  var STATUS = ['done', 'prog', 'rest', 'plan', 'skip'];

  function renderMonth(host) {
    var c = copy();
    host.appendChild(screenBar(c.month));
    var body = el('div', 'sc-body');
    var g = el('div', 'sc-month');
    c.days.forEach(function (d) { g.appendChild(el('div', 'sc-wd', esc(d))); });
    for (var i = 0; i < 35; i++) {
      var day = i - 1; // offset so the first cell is empty-ish
      var cell = el('div', 'sc-day');
      if (day < 1 || day > 30) cell.className += ' mute';
      if (day === 26) cell.className += ' today';
      cell.appendChild(el('b', null, day >= 1 && day <= 30 ? String(day) : ''));
      var n = Math.floor(seeded(i) * 4);
      if (n > 0) {
        var dots = el('div', 'dots');
        for (var k = 0; k < n; k++) dots.appendChild(el('i', null, '')).style.background = 'var(--' + ['green', 'amber', 'accent', 'red'][Math.floor(seeded(i * 7 + k) * 4)] + ')';
        cell.appendChild(dots);
        var bar = el('div', 'bar');
        var fill = el('i');
        fill.style.width = Math.round(30 + seeded(i * 3) * 70) + '%';
        bar.appendChild(fill);
        cell.appendChild(bar);
      }
      g.appendChild(cell);
    }
    body.appendChild(g);
    host.appendChild(body);
  }

  function renderWeek(host) {
    var c = copy();
    host.appendChild(screenBar(c.bar + ' — Weekly'));
    var body = el('div', 'sc-body');
    var t = el('table', 'sc-week');
    t.innerHTML = '<thead><tr><th></th>' + c.days.map(function (d) { return '<th>' + esc(d) + '</th>'; }).join('') + '</tr></thead>';
    var tb = el('tbody');
    for (var r = 0; r < 5; r++) {
      var tr = el('tr');
      tr.appendChild(el('td', 'name', esc(c.tasks[r])));
      for (var dcol = 0; dcol < 7; dcol++) {
        var td = el('td', 'c');
        var v = seeded(r * 7 + dcol);
        if (v < 0.22) td.innerHTML = '<span class="t">' + (r === 1 ? '45m' : r === 0 ? '2h' : '—') + '</span>';
        else if (v < 0.4) td.innerHTML = pill(v < 0.3 ? 'done' : 'prog', v < 0.3 ? c.done : c.prog);
        else if (v < 0.55) td.innerHTML = pill('none', c.plan);
        else td.innerHTML = '<span class="t">—</span>';
        tr.appendChild(td);
      }
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    body.appendChild(t);
    host.appendChild(body);
  }

  function renderDay(host) {
    var c = copy();
    host.appendChild(screenBar(c.bar + ' — Daily'));
    var body = el('div', 'sc-body');
    var kpis = el('div', 'sc-kpis');
    [['total', '6'], ['done', '2'], ['prog', '1'], ['left', '10h']].forEach(function (p) {
      var k = el('div', 'sc-kpi');
      k.appendChild(el('b', null, esc(p[1])));
      k.appendChild(el('span', null, esc(c.labels[p[0]])));
      kpis.appendChild(k);
    });
    body.appendChild(kpis);
    [0, 1, 2].forEach(function (i) {
      var card = el('div', 'sc-card');
      var h = el('h4');
      h.appendChild(el('i'));
      h.appendChild(document.createTextNode(esc(c.tasks[i])));
      if (i === 0) h.innerHTML += ' ' + pill('done', c.done);
      if (i === 1) h.innerHTML += ' ' + pill('prog', c.prog);
      card.appendChild(h);
      var f = el('div', 'sc-fields');
      f.appendChild(el('div', 'sc-field', '🕐 ' + ['1:00 PM', '3:00 PM', '6:00 PM'][i]));
      f.appendChild(el('div', 'sc-field', '⏱ ' + ['2h', '45m', '1h30'][i]));
      f.appendChild(el('div', 'sc-field wide', '📝 ' + (i === 0 ? 'Q3 numbers call at 4pm' : 'Tap to write…')));
      card.appendChild(f);
      body.appendChild(card);
    });
    host.appendChild(body);
  }

  function renderStats(host) {
    var c = copy();
    host.appendChild(screenBar(c.bar + ' — Analytics'));
    var body = el('div', 'sc-body');
    var tiles = el('div', 'sc-tiles');
    [['133', c.total], ['53%', c.doneK], ['291h', c.plannedT], ['154h', c.actualT]].forEach(function (p) {
      var t = el('div', 'sc-tile');
      t.appendChild(el('b', null, esc(p[0])));
      t.appendChild(el('span', null, esc(p[1])));
      tiles.appendChild(t);
    });
    body.appendChild(tiles);
    var bars = el('div', 'sc-bars');
    [8, 14, 22, 30, 18, 34, 46, 62].forEach(function (h, i) {
      var b = el('div', 'b' + (i === 7 ? ' hi' : ''));
      b.style.height = h + '%';
      bars.appendChild(b);
    });
    body.appendChild(bars);
    var rows = el('div', 'sc-rows');
    rows.appendChild(el('div', null, '<b style="font-size:11.5px">' + esc(c.timePerTask) + '</b>'));
    [92, 74, 61, 55, 34, 22, 4].forEach(function (p, i) {
      var r = el('div', 'sc-row');
      r.innerHTML = '<span>' + esc(c.tasks[i] || '—') + '</span><span class="track"><i style="width:' + p + '%"></i></span><span class="val">' + Math.round(p / 2) + 'h</span>';
      rows.appendChild(r);
    });
    body.appendChild(rows);
    host.appendChild(body);
  }

  var SCREENS = { month: renderMonth, week: renderWeek, day: renderDay, stats: renderStats };

  function mountScreens() {
    document.querySelectorAll('[data-screen]').forEach(function (host) {
      var kind = host.getAttribute('data-screen');
      if (SCREENS[kind]) SCREENS[kind](host);
    });
  }

  // ------------------------------------------------------------------
  // Scripted demo of the interface. Frames are painted in order on a
  // timer so the whole "plan -> run -> record -> add up" story plays in
  // about ten seconds. Honours prefers-reduced-motion by showing the
  // final frame and stopping.
  // ------------------------------------------------------------------
  var DEMO_COPY = {
    en: {
      chips: ['Weekly', 'Daily', 'Monthly'],
      tasks: ['Deep work', 'Gym', 'Client call'],
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      caps: [
        'You add a routine with a time <em>— 2 h of deep work.</em>',
        'You put it on Monday <em>— that is your plan.</em>',
        'You start the timer <em>— right in the cell.</em>',
        'You finish <em>— status becomes done.</em>',
        'The day records the real time <em>— 45 min actually spent.</em>',
        'The week adds it up <em>— 53% becomes 68%.</em>',
        'Less planning, more doing.'
      ],
      side: { day: 'Monday', planned: 'Planned', done: 'Done', pct: 'Done this week', bars: 'Last 5 weeks' }
    },
    fr: {
      chips: ['Hebdo', 'Quotidien', 'Mensuel'],
      tasks: ['Travail de fond', 'Sport', 'Appel client'],
      days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'],
      caps: [
        'Vous ajoutez une routine avec une durée <em>— 2 h de travail de fond.</em>',
        'Vous la placez sur lundi <em>— c\'est votre plan.</em>',
        'Vous lancez le minuteur <em>— directement dans la case.</em>',
        'Vous terminez <em>— le statut passe à fait.</em>',
        'La journée enregistre le temps réel <em>— 45 min réellement passées.</em>',
        'La semaine additionne <em>— 53% devient 68%.</em>',
        'Moins de planification, plus d\'action.'
      ],
      side: { day: 'Lundi', planned: 'Prévu', done: 'Fait', pct: 'Fait cette semaine', bars: '5 dernières semaines' }
    }
  };

  function mountDemo() {
    var host = document.querySelector('[data-demo]');
    if (!host) return;
    var c = (document.documentElement.lang || 'en').indexOf('fr') === 0 ? DEMO_COPY.fr : DEMO_COPY.en;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    host.innerHTML =
      '<div class="demo-window">' +
        '<div class="demo-top">' +
          '<span class="dlogo"><i></i>4cus</span>' +
          '<span class="dchip on">' + esc(c.chips[0]) + '</span>' +
          '<span class="dchip">' + esc(c.chips[1]) + '</span>' +
          '<span class="dchip">' + esc(c.chips[2]) + '</span>' +
        '</div>' +
        '<div class="demo-main">' +
          '<div class="demo-grid"></div>' +
          '<aside class="demo-side">' +
            '<h5>' + esc(c.side.day) + '</h5>' +
            '<div class="demo-stat"><span>' + esc(c.side.planned) + '</span><b data-d="plan">0h</b></div>' +
            '<div class="demo-meter" data-d="meterwrap"><i data-d="meter"></i></div>' +
            '<div class="demo-stat"><span>' + esc(c.side.done) + '</span><b data-d="pct">53%</b></div>' +
            '<h5 style="margin-top:14px">' + esc(c.side.bars) + '</h5>' +
            '<div class="demo-bars"><i></i><i></i><i></i><i></i><i class="hi"></i></div>' +
          '</aside>' +
        '</div>' +
        '<div class="demo-foot">' +
          '<span class="demo-cap" data-d="cap"></span>' +
          '<button class="demo-btn" type="button" data-d="toggle"></button>' +
        '</div>' +
      '</div>';

    var grid = host.querySelector('.demo-grid');
    var cap = host.querySelector('[data-d="cap"]');
    var toggle = host.querySelector('[data-d="toggle"]');
    var meter = host.querySelector('[data-d="meter"]');
    var meterWrap = host.querySelector('[data-d="meterwrap"]');
    var planV = host.querySelector('[data-d="plan"]');
    var pctV = host.querySelector('[data-d="pct"]');
    var bars = host.querySelectorAll('.demo-bars i');

    // Build the mini week grid: one target cell we animate through states.
    var tbl = '<table class="sc-week"><thead><tr><th></th>';
    c.days.forEach(function (d) { tbl += '<th>' + esc(d) + '</th>'; });
    tbl += '</tr></thead><tbody>';
    c.tasks.forEach(function (t, r) {
      tbl += '<tr data-r="' + r + '"><td class="name">' + esc(t) + '</td>';
      for (var dcol = 0; dcol < c.days.length; dcol++) {
        var pre = (r === 0 && dcol === 0) ? ' data-target="1"' : '';
        tbl += '<td class="c"' + pre + '><span class="t">—</span></td>';
      }
      tbl += '</tr>';
    });
    tbl += '</tbody></table>';
    grid.innerHTML = tbl;

    var target = grid.querySelector('[data-target]');
    var otherCells = grid.querySelectorAll('td.c:not([data-target])');

    function setTarget(html) { target.innerHTML = html; }
    function setOthers() {
      // A couple of neighbouring cells already carry data, so the grid looks
      // lived-in rather than empty.
      var k = 0;
      otherCells.forEach(function (td) {
        if (k % 3 === 0) td.innerHTML = '<span class="pill p-done">' + esc(c.side.done.toLowerCase()) + '</span>';
        else if (k % 3 === 1) td.innerHTML = '<span class="t">45m</span>';
        k++;
      });
    }

    var frames = [
      function () { setTarget('<span class="t">2 h</span>'); setOthers(); planV.textContent = '2h'; cap.innerHTML = c.caps[0]; },
      function () { setTarget('<span class="pill p-none">' + esc(c.side.planned.toLowerCase()) + '</span>'); meter.style.width = '12%'; planV.textContent = '2h'; cap.innerHTML = c.caps[1]; },
      function () { setTarget(pill('prog', c.chips[0] === 'Weekly' ? 'in progress' : 'en cours') + ' <span class="demo-celltime run" data-d="t">0:00</span>'); cap.innerHTML = c.caps[2]; },
      function () { var t = host.querySelector('[data-d="t"]'); if (t) t.textContent = '0:45'; meter.style.width = '38%'; cap.innerHTML = c.caps[3]; },
      function () { setTarget(pill('done', c.side.done.toLowerCase()) + ' <span class="demo-celltime">0:45</span>'); meter.style.width = '38%'; meterWrap.classList.add('done'); cap.innerHTML = c.caps[4]; },
      function () { pctV.textContent = '68%'; meter.style.width = '68%'; [22, 34, 41, 55, 68].forEach(function (h, i) { bars[i].style.height = h + '%'; }); cap.innerHTML = c.caps[5]; },
      function () { cap.innerHTML = c.caps[6]; }
    ];

    var idx = -1;
    var timer = null;
    var playing = false;

    function paint(i) { frames[Math.max(0, Math.min(frames.length - 1, i))](); }
    function tick() {
      idx = (idx + 1) % frames.length;
      paint(idx);
    }
    function play() {
      if (playing || reduced) return;
      playing = true;
      toggle.textContent = '❚❚ Pause';
      timer = setInterval(tick, 1500);
    }
    function pause() {
      playing = false;
      toggle.textContent = '▶ Replay';
      if (timer) { clearInterval(timer); timer = null; }
    }
    toggle.addEventListener('click', function () {
      if (playing) { pause(); return; }
      idx = -1;
      meter.style.width = '0%';
      meterWrap.classList.remove('done');
      pctV.textContent = '53%';
      [10, 22, 34, 41, 55].forEach(function (h, i) { bars[i].style.height = h + '%'; });
      play();
    });

    if (reduced) {
      // Static final state: the story is still legible, just not animated.
      idx = 0;
      for (var f = 0; f < frames.length; f++) paint(f);
      toggle.textContent = '▶ Replay';
      toggle.addEventListener('click', function () { idx = -1; play(); });
    } else {
      paint(0);
      toggle.textContent = '❚❚ Pause';
      // Start once the section is actually on screen.
      if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { if (e.isIntersecting) { play(); io.disconnect(); } });
        }, { threshold: 0.35 });
        io.observe(host);
      } else {
        play();
      }
      // Pause when scrolled away so it is not burning cycles off-screen.
      document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
    }
  }

  function boot() {
    var rel = document.querySelector('[data-releases]');
    if (rel) render(rel, { limit: parseInt(rel.getAttribute('data-releases'), 10) || 50 });

    var whats = document.querySelector('[data-latest-notes]');
    if (whats) {
      fetch(CFG.releasesApi, { headers: { Accept: 'application/vnd.github+json' } })
        .then(function (r) { return r.json(); })
        .then(function (list) {
          var latest = (list || []).filter(function (r) { return !r.draft; })[0];
          if (!latest) { whats.innerHTML = '<p class="empty">No release notes yet.</p>'; return; }
          var dls = (latest.assets || []).map(function (a) { return a.browser_download_url; });
          whats.innerHTML =
            '<div class="notes">' +
              '<h3>' + esc((latest.name || latest.tag_name) + ' · ' + fmtDate(latest.published_at)) + ' &middot; ' +
              '<a href="https://github.com/' + esc(CFG.repo) + '/releases/tag/' + esc(latest.tag_name) + '" rel="noopener">release notes</a></h3>' +
              md(latest.body) +
            '</div>';
        })
        .catch(function () { whats.innerHTML = '<p class="empty">Release notes are available on <a href="https://github.com/' + esc(CFG.repo) + '/releases" rel="noopener">GitHub</a>.</p>'; });
    }

    document.querySelectorAll('[data-app-link]').forEach(function (a) {
      a.href = CFG.appUrl;
    });

    mountScreens();
    mountDemo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
