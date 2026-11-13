#!/usr/bin/env node
/*
  Sync the catalog from GitHub topics.

  A repo owned by OWNER that carries the topic `shelf` gets a card on the site.
  Remove the topic and its card is hidden (kept in the private catalog, never deleted).

  Two files, same as settings.html writes them:
    site-catalog/catalog.json        private: every card, hidden ones included
    inquiredu.github.io/projects.json  public: shown cards only

  The sync only acts when a tag changes, so cards edited in settings.html keep their
  edits: title, note, call number, order and visibility all stay as you left them.
  The one exception is a `status-…` topic (status-alpha, status-in-progress), which
  always sets the card's status, because adding one is an explicit instruction.

  Keys (the same two settings.html uses)
    REPO_LIST_KEY    fine-grained, All repositories, no extra permissions (Metadata read)
    PUBLISHING_KEY   fine-grained, inquiredu.github.io + site-catalog, Contents read and write

  Usage
    REPO_LIST_KEY=… PUBLISHING_KEY=… node scripts/sync-catalog.mjs              write changes
    REPO_LIST_KEY=… PUBLISHING_KEY=… node scripts/sync-catalog.mjs --dry-run    show changes only
    … --dry-run --assume-tagged=repo-a,repo-b                                    preview cards for untagged repos
  Locally, `gh auth token` works for both keys.
*/
import { appendFile } from 'node:fs/promises';

const OWNER = process.env.OWNER || 'inquiredu';
const TOPIC = process.env.TOPIC || 'shelf';
const SITE_REPO = process.env.SITE_REPO || 'inquiredu.github.io';
const PRIVATE_REPO = process.env.PRIVATE_REPO || 'site-catalog';
const BRANCH = 'main';
const PUBLIC_PATH = 'projects.json';
const PRIVATE_PATH = 'catalog.json';
const READ_KEY = process.env.REPO_LIST_KEY || '';
const WRITE_KEY = process.env.PUBLISHING_KEY || '';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const assumeArg = args.find(a => a.startsWith('--assume-tagged='));
const ASSUME = new Set((assumeArg ? assumeArg.slice(16).split(',') : []).map(s => s.trim().toLowerCase()).filter(Boolean));
const SKIP_SUBJECTS = new Set([TOPIC, 'github-pages']);
const PUBLIC_LOG = !!process.env.GITHUB_ACTIONS;

if (!READ_KEY || !WRITE_KEY) {
  const names = [!READ_KEY && 'REPO_LIST_KEY', !WRITE_KEY && 'PUBLISHING_KEY'].filter(Boolean);
  const missing = names.join(' and ');
  if (process.env.GITHUB_ACTIONS) {
    console.log('::warning::' + (names.length > 1 ? 'The ' + missing + ' secrets aren’t set' : 'The ' + missing + ' secret isn’t set') + ', so the catalog was not synced. See README.md.');
    process.exit(0);
  }
  console.error('Set ' + missing + '. See the top of this file.');
  process.exit(1);
}

async function gh(path, key, opts = {}) {
  const res = await fetch('https://api.github.com' + path, {
    method: opts.method || 'GET',
    body: opts.body,
    headers: {
      Authorization: 'Bearer ' + key,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': OWNER + '-catalog-sync'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body; try { msg = JSON.parse(body).message; } catch {}
    const err = new Error('GitHub answered ' + res.status + ' for ' + (opts.method || 'GET') + ' ' + path + ': ' + msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const contents = (repo, path) => '/repos/' + OWNER + '/' + repo + '/contents/' + path;
const fromB64 = s => Buffer.from(s, 'base64').toString('utf8');
const toB64 = s => Buffer.from(s, 'utf8').toString('base64');

async function readFile(repo, path) {
  const f = await gh(contents(repo, path) + '?ref=' + BRANCH, WRITE_KEY);
  return { text: fromB64(f.content), sha: f.sha };
}
/* sha = the version we read. GitHub refuses the write (409) if the file changed since. */
async function writeFile(repo, path, text, sha, message) {
  const body = { message, content: toB64(text), branch: BRANCH };
  if (sha) body.sha = sha;
  return gh(contents(repo, path), WRITE_KEY, { method: 'PUT', body: JSON.stringify(body) });
}

async function ownedRepos() {
  const all = [];
  for (let page = 1; page < 20; page++) {
    const list = await gh('/user/repos?affiliation=owner&per_page=100&page=' + page, READ_KEY);
    all.push(...list);
    if (list.length < 100) break;
  }
  return all.filter(r => r.owner.login.toLowerCase() === OWNER.toLowerCase());
}

/* Same naming rules as settings.html, so cards look alike whichever way they were added. */
const prettify = name => name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAi\b/g, 'AI').replace(/\bMn\b/g, 'MN');
const humanize = s => { const t = s.replace(/-+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const callFor = title => '000 ' + (title.replace(/^(the|a|an)\s+/i, '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NEW');
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function siteBase() {
  try {
    const f = await gh(contents(SITE_REPO, 'CNAME') + '?ref=' + BRANCH, WRITE_KEY);
    const host = fromB64(f.content).trim();
    if (host) return 'https://' + host;
  } catch {}
  return 'https://' + OWNER.toLowerCase() + '.github.io';
}

function liveUrl(r, site) {
  if (r.homepage) return r.homepage;
  if (r.has_pages) return site + '/' + r.name + '/';
  return '';
}

/* Read the live page's own title and description, the way a link preview would. */
async function pageMeta(url) {
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': OWNER + '-catalog-sync' } });
    clearTimeout(timer);
    if (!res.ok) return {};
    const html = (await res.text()).slice(0, 200000);
    const meta = (attr, name) => {
      const tag = html.match(new RegExp('<meta[^>]+' + attr + '=["\']' + name + '["\'][^>]*>', 'i'));
      const c = tag && tag[0].match(/content=["']([^"']*)["']/i);
      return c ? decode(c[1]).trim() : '';
    };
    const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const raw = meta('property', 'og:title') || (t ? decode(t[1].replace(/<[^>]+>/g, '')).trim() : '');
    const title = raw.split(/\s+[·|—–-]\s+/)[0].trim();   // "Hype Explorer | Education system field" -> "Hype Explorer"
    const description = meta('name', 'description') || meta('property', 'og:description');
    return { title, description };
  } catch { return {}; }
}

function statusTopic(topics) {
  const t = topics.find(x => x.startsWith('status-') && x.length > 7);
  return t ? humanize(t.slice(7)) : '';
}

async function newCard(r, site, taken) {
  const live = liveUrl(r, site);
  const meta = live ? await pageMeta(live) : {};
  const title = meta.title || prettify(r.name);
  const group = live ? 'live' : (r.private ? 'workshop' : 'source');
  const status = statusTopic(r.topics) || (live ? 'Live' : (r.private ? 'In progress' : 'Open source'));
  const subject = r.topics.filter(t => !SKIP_SUBJECTS.has(t) && !t.startsWith('status-')).slice(0, 3).map(prettify).join(' · ');
  let id = r.name.toLowerCase(); while (taken.has(id)) id += '-2';
  const card = { id, repo: r.name, visible: true, tagged: true, call: callFor(title), title, status, group, subject, note: (r.description || meta.description || '').trim() };
  const url = live || (r.private ? '' : r.html_url);
  if (url) card.url = url;
  return card;
}

/* The public file: shown cards only, without the sync's bookkeeping. Matches settings.html. */
function publicText(catalog, today) {
  const projects = catalog.projects.filter(p => p.visible !== false).map(p => {
    const { tagged, ...card } = p;
    return Object.assign(card, { visible: true });
  });
  return JSON.stringify({ version: catalog.version || 1, updated: today, projects }, null, 2) + '\n';
}

async function main() {
  const priv = await readFile(PRIVATE_REPO, PRIVATE_PATH);
  const data = JSON.parse(priv.text);
  const projects = data.projects || [];
  const site = await siteBase();
  const repos = await ownedRepos();
  const isTagged = r => (r.topics || []).includes(TOPIC) || ASSUME.has(r.name.toLowerCase());
  const tagged = repos.filter(isTagged);
  const byRepo = new Map(projects.filter(p => p.repo).map(p => [p.repo.toLowerCase(), p]));
  const taken = new Set(projects.map(p => p.id));
  const added = [], shown = [], hidden = [], restatused = [];

  /* Newly tagged repos that have no card yet: add them at the top, newest first. */
  const fresh = tagged.filter(r => !byRepo.has(r.name.toLowerCase()))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const r of fresh) {
    const card = await newCard(r, site, taken);
    taken.add(card.id);
    projects.unshift(card);
    added.push(card);
  }

  /* Repos that already have a card. */
  for (const r of tagged) {
    const p = byRepo.get(r.name.toLowerCase());
    if (!p) continue;
    if (p.tagged !== true) {             // tag just added: switch the card on
      p.tagged = true;
      if (!p.visible) { p.visible = true; shown.push(p); }
      if (!p.url) {
        const live = liveUrl(r, site);
        const url = live || (r.private ? '' : r.html_url);
        if (url) { p.url = url; p.group = live ? 'live' : 'source'; }
      }
    }
    const st = statusTopic(r.topics || []);
    if (st && st !== p.status) { p.status = st; restatused.push(p); }
  }

  /* Tag removed: hide the card and hand it back to settings.html. */
  const tagSet = new Set(tagged.map(r => r.name.toLowerCase()));
  for (const p of projects) {
    if (p.tagged === true && p.repo && !tagSet.has(p.repo.toLowerCase())) {
      delete p.tagged;
      if (p.visible) { p.visible = false; hidden.push(p); }
    }
  }

  /* Public file names only cards that are on the site, so hidden ones stay unnamed in its history. */
  const lines = [
    ...added.map(p => 'Added ' + p.title + (p.visible ? '' : ' (hidden)')),
    ...shown.map(p => 'Showed ' + p.title),
    ...hidden.map(p => 'Hid ' + p.title),
    ...restatused.map(p => 'Set ' + p.title + ' to ' + p.status)
  ];
  const changedCatalog = JSON.stringify(projects) !== JSON.stringify(JSON.parse(priv.text).projects || []);
  /* Action logs on a public repo are public: there, report counts and never names. */
  const counts = tagged.length + ' tagged · ' + added.length + ' added · ' + shown.length + ' shown · ' + hidden.length + ' hidden · ' + restatused.length + ' status changes';
  if (PUBLIC_LOG) console.log(counts + (changedCatalog ? '' : ' · no changes'));
  else {
    console.log('Tagged "' + TOPIC + '": ' + (tagged.map(r => r.name).join(', ') || 'none') + (ASSUME.size ? ' (some assumed for preview)' : ''));
    console.log(lines.length ? lines.join('\n') : changedCatalog ? 'Recorded which cards are tagged.' : 'No changes.');
  }
  if (DRY) {
    if (added.length && !PUBLIC_LOG) console.log('\nNew cards:\n' + JSON.stringify(added, null, 2));
    console.log('\nDry run: nothing was written.');
    return;
  }
  if (!changedCatalog) return;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const catalog = Object.assign({}, data, { updated: today, saved: now.toISOString(), projects });
  const summary = lines.length ? lines.join('; ') : 'Recorded which cards are tagged';
  const shownCount = projects.filter(p => p.visible !== false).length;

  /* Private first, then public, the same order as settings.html. */
  await writeFile(PRIVATE_REPO, PRIVATE_PATH, JSON.stringify(catalog, null, 2) + '\n', priv.sha, 'Tag sync: ' + summary);
  const pubNew = publicText(catalog, today);
  let pub = null; try { pub = await readFile(SITE_REPO, PUBLIC_PATH); } catch (e) { if (e.status !== 404) throw e; }
  if (!pub || pub.text !== pubNew) {
    const publicLines = [...added.filter(p => p.visible), ...shown].map(p => 'Added ' + p.title).concat(hidden.length ? ['Removed ' + hidden.length + ' card' + (hidden.length === 1 ? '' : 's')] : []);
    await writeFile(SITE_REPO, PUBLIC_PATH, pubNew, pub && pub.sha, 'Tag sync: ' + (publicLines.join('; ') || 'Update project list') + ' (' + shownCount + ' projects)');
  }

  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '### Tag sync\n\n' + counts + '\n\nDetails are in the commit to the private catalog.\n');
}

main().catch(err => {
  if (err.status === 409) { console.log('::warning::The catalog changed while the sync was running. It will try again next hour.'); process.exit(0); }
  /* Error text can name a private repo, so a public log gets the status code only. */
  console.error(PUBLIC_LOG ? 'The sync failed (GitHub status ' + (err.status || 'unknown') + '). Run it locally to see details.' : (err.message || err));
  process.exit(1);
});
