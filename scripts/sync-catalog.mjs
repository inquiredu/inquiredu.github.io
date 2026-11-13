#!/usr/bin/env node
/*
  Sync projects.json from GitHub topics.

  A repo owned by OWNER that carries the topic `catalog` gets a card on the site.
  Remove the topic and its card is hidden (kept in the file, never deleted).

  The sync only acts when a tag changes, so cards edited in admin.html keep their
  edits: title, note, call number, order and visibility all stay as you left them.
  The one exception is a `status-…` topic (status-alpha, status-in-progress), which
  always sets the card's status, because adding one is an explicit instruction.

  Usage
    CATALOG_TOKEN=… node scripts/sync-catalog.mjs              write changes
    CATALOG_TOKEN=… node scripts/sync-catalog.mjs --dry-run    show changes only
    … --dry-run --assume-tagged=repo-a,repo-b                  preview cards for untagged repos
*/
import { readFile, writeFile, appendFile } from 'node:fs/promises';

const OWNER = process.env.OWNER || 'inquiredu';
const TOPIC = process.env.TOPIC || 'catalog';
const TOKEN = process.env.CATALOG_TOKEN || process.env.GH_TOKEN || '';
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const assumeArg = args.find(a => a.startsWith('--assume-tagged='));
const ASSUME = new Set((assumeArg ? assumeArg.slice(16).split(',') : []).map(s => s.trim().toLowerCase()).filter(Boolean));
const FILE = new URL('../projects.json', import.meta.url);
const CNAME = new URL('../CNAME', import.meta.url);
const SKIP_SUBJECTS = new Set([TOPIC, 'github-pages']);

if (!TOKEN) {
  if (process.env.GITHUB_ACTIONS) {
    console.log('::warning::The CATALOG_TOKEN secret is not set, so the catalog was not synced. See README.md.');
    process.exit(0);
  }
  console.error('No token. Set CATALOG_TOKEN to a GitHub token that can read repository metadata for ' + OWNER + '.');
  process.exit(1);
}

async function gh(path) {
  const res = await fetch('https://api.github.com' + path, {
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': OWNER + '-catalog-sync'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body; try { msg = JSON.parse(body).message; } catch {}
    throw new Error('GitHub answered ' + res.status + ' for ' + path + ': ' + msg);
  }
  return res.json();
}

async function ownedRepos() {
  const all = [];
  for (let page = 1; page < 20; page++) {
    const list = await gh('/user/repos?affiliation=owner&per_page=100&page=' + page);
    all.push(...list);
    if (list.length < 100) break;
  }
  return all.filter(r => r.owner.login.toLowerCase() === OWNER.toLowerCase());
}

/* Same naming rules as admin.html, so cards look alike whichever way they were added. */
const prettify = name => name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bAi\b/g, 'AI').replace(/\bMn\b/g, 'MN');
const humanize = s => { const t = s.replace(/-+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const callFor = title => '000 ' + (title.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NEW');
const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function siteBase() {
  try { const host = (await readFile(CNAME, 'utf8')).trim(); if (host) return 'https://' + host; } catch {}
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

async function main() {
  const data = JSON.parse(await readFile(FILE, 'utf8'));
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

  /* Tag removed: hide the card and hand it back to admin.html. */
  const tagSet = new Set(tagged.map(r => r.name.toLowerCase()));
  for (const p of projects) {
    if (p.tagged === true && p.repo && !tagSet.has(p.repo.toLowerCase())) {
      delete p.tagged;
      if (p.visible) { p.visible = false; hidden.push(p); }
    }
  }

  const lines = [
    ...added.map(p => 'Added ' + p.title + ' (' + p.repo + ')'),
    ...shown.map(p => 'Showed ' + p.title),
    ...hidden.map(p => 'Hid ' + p.title),
    ...restatused.map(p => 'Set ' + p.title + ' to ' + p.status)
  ];
  const before = await readFile(FILE, 'utf8');
  const out = JSON.stringify(Object.assign({}, data, { projects }), null, 2) + '\n';
  const changed = out !== before;
  if (changed && !lines.length) lines.push('Recorded which cards are tagged');

  console.log('Tagged "' + TOPIC + '": ' + (tagged.map(r => r.name).join(', ') || 'none') + (ASSUME.size ? ' (some assumed for preview)' : ''));
  console.log(lines.length ? lines.join('\n') : 'No changes.');
  if (DRY) {
    if (added.length) console.log('\nNew cards:\n' + JSON.stringify(added, null, 2));
    console.log('\nDry run: projects.json was not changed.');
    return;
  }
  if (!changed) return;

  data.updated = new Date().toISOString().slice(0, 10);
  await writeFile(FILE, JSON.stringify(Object.assign({}, data, { projects }), null, 2) + '\n');

  const message = 'Catalog sync: ' + lines.join('; ');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'message=' + message.replace(/\n/g, ' ') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '### Catalog sync\n\n' + lines.map(l => '- ' + l).join('\n') + '\n');
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
