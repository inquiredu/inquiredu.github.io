import {OWNER, PRIVATE, fromBase64, safeURL} from './core.mjs?v=20261115.2';
import {repoKey} from './repositories.mjs?v=20261115.3';

export const README_LIMIT = 12000;

// Keep the prose of a README and drop what only matters on GitHub: comments, images, badges, markup.
export function cleanReadme(text, limit = README_LIMIT) {
  let clean = String(text || '').replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/!\[[^\]]*\]\[[^\]]*\]/g, '')
    .replace(/\[\s*\]\([^)]*\)/g, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .split('\n').map(line => line.trimEnd()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  const truncated = clean.length > limit;
  if (truncated) {
    const cut = clean.lastIndexOf('\n\n', limit);
    clean = clean.slice(0, cut > limit / 2 ? cut : limit).trimEnd() + '\n\n[README shortened]';
  }
  return {text: clean, truncated, words: clean ? clean.split(/\s+/).length : 0};
}

export function repoFacts(meta, name) {
  if (!meta) return '';
  const topics = (Array.isArray(meta.topics) ? meta.topics : []).filter(t => typeof t === 'string' && t !== 'shelf' && !t.startsWith('status-'));
  const lines = [
    `Repository: ${OWNER}/${meta.name || name}`,
    meta.description && `Description: ${meta.description}`,
    topics.length && `Topics: ${topics.join(', ')}`,
    safeURL(meta.homepage) && `Homepage: ${meta.homepage}`,
    meta.language && `Primary language: ${meta.language}`,
    typeof meta.private === 'boolean' && `Visibility: ${meta.private ? 'private' : 'public'}`,
    meta.archived && 'Archived: yes',
    (meta.pushed_at || '').slice(0, 10) && `Last updated: ${meta.pushed_at.slice(0, 10)}`
  ].filter(Boolean);
  return lines.join('\n').slice(0, 2000);
}

// Reads the linked repository with the owner's own sign-in. Never throws: it reports what it could and could not read.
export async function readRepoContext(github, repo) {
  const key = repoKey(repo);
  if (!key || !github) return {readme: '', repository: '', read: false, message: 'This card has no linked repository, so only the card itself is sent.'};
  const name = repo.trim().split('/').at(-1), path = `/repos/${OWNER}/${encodeURIComponent(name)}`;
  const [info, file] = await Promise.allSettled([github.api(path), github.api(`${path}/readme`)]);
  let meta = info.status === 'fulfilled' ? info.value : null, fromIndex = false;
  if (!meta) {
    try {
      const saved = await github.read(PRIVATE, 'repos.json', true);
      meta = (saved?.data?.repos || []).find(r => repoKey(r.full_name || r.name) === key) || null;
      fromIndex = !!meta;
    } catch {}
  }
  let readme = {text: '', truncated: false, words: 0};
  if (file.status === 'fulfilled' && typeof file.value?.content === 'string') {
    try { readme = cleanReadme(fromBase64(file.value.content)); } catch {}
  }
  const repository = repoFacts(meta, name), parts = [];
  if (readme.text) parts.push(`Read ${file.value.name || 'the README'} from ${name} (${readme.words.toLocaleString('en-US')} words${readme.truncated ? ', shortened to fit' : ''}).`);
  else if (info.status === 'fulfilled') parts.push(`${name} has no README the studio can read.`);
  else if ([403, 404].includes(info.reason?.status)) parts.push(`GitHub did not let this sign-in read ${name}. Private repositories need the studio GitHub App installed on them.`);
  else parts.push(`GitHub could not be reached to read ${name}.`);
  if (repository) parts.push(fromIndex ? 'Using the details in your saved repository index.' : 'Including its GitHub details.');
  return {readme: readme.text, repository, read: !!(readme.text || repository), message: parts.join(' ')};
}
