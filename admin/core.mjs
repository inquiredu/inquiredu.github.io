export const OWNER = 'inquiredu';
export const OWNER_ID = 192934662;
export const SITE = 'inquiredu.github.io';
export const PRIVATE = 'site-catalog';
export const safeURL = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const base64 = text => { let binary = ''; for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte); return btoa(binary); };
export const fromBase64 = text => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
export function publicProjects(catalog) {
  return { version: 1, updated: new Date().toISOString().slice(0, 10), projects: catalog.projects.filter(p => p.visible !== false).map(p => {
    const card = {};
    for (const key of ['id', 'repo', 'featured', 'call', 'title', 'status', 'group', 'subject', 'note']) if (p[key] !== undefined) card[key] = p[key];
    card.visible = true;
    if (safeURL(p.url)) card.url = safeURL(p.url);
    return card;
  }) };
}
export function publicContent(data) {
  return {
    version: 1, intro: data.intro || '',
    writing: (data.writing || []).filter(x => x.published === true).map(({id, title, date, excerpt, body, url}) => ({id, title, date, excerpt, body, url: safeURL(url), published: true})),
    playlists: (data.playlists || []).filter(x => x.published === true).map(({id, title, date, note, url, tracks}) => ({id, title, date, note, url: safeURL(url), published: true, tracks: (tracks || []).map(({title, artist, url}) => ({title, artist, url: safeURL(url)}))}))
  };
}
export class GitHub {
  constructor(token, request = fetch) { this.token = token; this.request = request; }
  async api(path, method = 'GET', body) {
    const response = await this.request(`https://api.github.com${path}`, {
      method, headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? {'Content-Type':'application/json'} : {}) },
      ...(body ? {body: JSON.stringify(body)} : {}), cache: 'no-store'
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 ? 'Your session expired. Sign out and sign in again.' : [409, 422].includes(response.status) ? 'The collection changed on GitHub. Reload before publishing; your edits have not overwritten the newer version.' : response.status === 403 ? 'GitHub refused access. Check the app’s repository permissions.' : `GitHub request failed (${response.status}). Try again.`);
      error.status = response.status; throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  async verify() {
    const user = await this.api('/user');
    if (user.id !== OWNER_ID) throw new Error('This editor belongs to inquiredu. Sign in with that GitHub account.');
    for (const repo of [SITE, PRIVATE]) {
      const info = await this.api(`/repos/${OWNER}/${repo}`);
      if (!info.permissions?.push) throw new Error('Install the GitHub App on both site repositories with Contents read and write.');
    }
    return user;
  }
  async read(repo, path, optional = false) {
    try {
      const result = await this.api(`/repos/${OWNER}/${repo}/contents/${path}`);
      return {data: JSON.parse(fromBase64(result.content)), sha: result.sha};
    } catch (error) { if (optional && error.status === 404) return null; throw error; }
  }
  async write(repo, path, data, sha, message) {
    const result = await this.api(`/repos/${OWNER}/${repo}/contents/${path}`, 'PUT', {message, content: base64(json(data)), ...(sha ? {sha} : {})});
    return result.content.sha;
  }
  async head() { return (await this.api(`/repos/${OWNER}/${SITE}/git/ref/heads/main`)).object.sha; }
  async commitFiles(files, expectedHead) {
    const prefix = `/repos/${OWNER}/${SITE}`;
    if (await this.head() !== expectedHead) throw new Error('The site changed on GitHub. Reload the editor before publishing.');
    const head = await this.api(`${prefix}/git/commits/${expectedHead}`);
    const tree = [];
    for (const file of files) {
      const blob = await this.api(`${prefix}/git/blobs`, 'POST', {content: file.content, encoding: file.encoding || 'utf-8'});
      tree.push({path: file.path, mode: '100644', type: 'blob', sha: blob.sha});
    }
    const createdTree = await this.api(`${prefix}/git/trees`, 'POST', {base_tree: head.tree.sha, tree});
    const commit = await this.api(`${prefix}/git/commits`, 'POST', {message: 'Publish photograph collection', tree: createdTree.sha, parents: [expectedHead]});
    await this.api(`${prefix}/git/refs/heads/main`, 'PATCH', {sha: commit.sha, force: false});
    return commit.sha;
  }
}
