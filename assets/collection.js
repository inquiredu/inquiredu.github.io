const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const safeLink = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
function link(text, url) {
  const a = el('a', text); a.href = safeLink(url); return a;
}
function renderWriting(items) {
  for (const item of items) {
    const article = el('article', '', 'entry');
    article.id = `note-${item.id}`;
    article.append(el('p', item.date || 'Field note', 'entry-meta'), el('h3', item.title));
    if (item.excerpt) article.append(el('p', item.excerpt));
    if (item.body) {
      const details = el('details'); details.append(el('summary', 'Read the note'), el('p', item.body)); article.append(details);
    }
    if (safeLink(item.url)) article.append(link('Read elsewhere ↗', item.url));
    document.getElementById('writingItems').append(article);
  }
}
function renderPlaylists(items) {
  for (const item of items) {
    const article = el('article', '', 'entry');
    article.append(el('p', item.date || 'A song list', 'entry-meta'), el('h3', item.title));
    if (item.note) article.append(el('p', item.note));
    const list = el('ol', '', 'tracks');
    for (const track of item.tracks || []) {
      const li = el('li'); const title = [track.title, track.artist].filter(Boolean).join(' — ');
      li.append(safeLink(track.url) ? link(title, track.url) : document.createTextNode(title)); list.append(li);
    }
    article.append(list);
    if (safeLink(item.url)) article.append(link('Listen to the playlist ↗', item.url));
    document.getElementById('listeningItems').append(article);
  }
}
try {
  const response = await fetch('content.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Content unavailable');
  const content = await response.json();
  if (content.intro) document.getElementById('siteIntro').textContent = content.intro;
  const writing = (content.writing || []).filter(x => x.published === true);
  const playlists = (content.playlists || []).filter(x => x.published === true);
  renderWriting(writing); renderPlaylists(playlists);
  for (const [section, count] of [['writing', writing.length], ['listening', playlists.length]]) {
    document.getElementById(section).hidden = !count;
    document.getElementById(`${section}Nav`).hidden = !count;
  }
} catch { /* Optional shelves stay out of the way until published. */ }
