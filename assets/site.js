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

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^\s*\|/.test(line)) {
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
      if (h) { closeList(); out.push('<h3>' + inline(h[2]) + '</h3>'); continue; }
      if (/^\s*>\s?/.test(line)) { closeList(); out.push('<blockquote>' + inline(line.replace(/^\s*>\s?/, '')) + '</blockquote>'); continue; }
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>');
        continue;
      }
      if (!line.trim()) { closeList(); continue; }
      closeList();
      out.push('<p>' + inline(line) + '</p>');
    }
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

  window.S4CUS.site = { render: render, md: md, esc: esc, fmtDate: fmtDate };

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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
