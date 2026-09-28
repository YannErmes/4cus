# 4cus — marketing site + downloads

Static site for **4cus**, the routine tracker. Two pages in two languages:

| File | Purpose |
| --- | --- |
| `index.html` | English landing page (problem, how it works, features, platforms, FAQ) |
| `fr.html` | French landing page |
| `downloads.html` | English downloads + full version history |
| `downloads-fr.html` | French downloads + full version history |
| `assets/site.css` | All styling (dark theme, responsive, no framework) |
| `assets/site.js` | Config + the release-list renderer |

## How the version history works

The downloads page does **not** keep a hardcoded list. It fetches

```
https://api.github.com/repos/YannErmes/timetraker/releases?per_page=50
```

at page load and renders every non-draft release: version, date, per-platform
download buttons (matched from the asset names) and the release notes rendered
from a small markdown subset. Consequences:

- Publishing a new version makes it appear automatically — **no site change**.
- Old versions stay downloadable forever, so the page doubles as an archive.
- If GitHub is unreachable the page degrades to a link to the releases page.

Asset names produced by the release workflow in the app repo:

```
4cus-<tag>.apk            -> Android
4cus-<tag>-windows.zip    -> Windows
4cus-<tag>-unsigned.ipa   -> iOS
4cus-<tag>-web.zip        -> Web (offline build)
```

## Configuration

`assets/site.js` has one block to edit:

```js
window.S4CUS = {
  appUrl: 'https://...',        // the deployed Flutter web app
  repo: 'YannErmes/timetraker',
  releasesApi: '...',
};
```

Every "Open the app" link is driven by `appUrl`, so pointing the site at a
different deployment is a one-line change.

## Deploying

Static files, no build step. Import the repo into Vercel (or any static host) and
serve the root. `vercel.json` only adds `cleanUrls` and cache/security headers.

## Adding content

- New section on the landing page: edit `index.html` **and** `fr.html` — the two
  files are independent on purpose, so each language is proper HTML for SEO
  rather than JavaScript-swapped text.
- Release notes: written on GitHub when a version is tagged, not here.
