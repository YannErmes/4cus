// Single place to change the deployed app URL / repo coordinates.
window.S4CUS = {
  // TODO: point this at the Vercel deployment of the Flutter web app.
  appUrl: 'https://timetracker.vercel.app',
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
