#!/usr/bin/env node
/*
  Darkroom: bring photos from Google Photos into the slide projector on inquiredu.org.

  1. Opens Google sign-in in your browser.
  2. Opens Google Photos' own chooser. Search an album title, a place, a person or a
     year, and pick the photos you want.
  3. Downloads each pick at web size (Google does the resizing), removes camera and
     location data, and saves it to assets/slides/. Adds it to slides.json.
  4. Optionally lets you caption each one, then commits. It pushes only after you say yes.

  Why a command and not a web page: Google's photo server won't hand picked photos to
  a web page, only to a program like this one.

  Setup, once: see "Slides" in README.md.

  Usage
    node scripts/darkroom.mjs              pick, import, caption, commit, ask to publish
    node scripts/darkroom.mjs --no-push    the same, but stop after the local commit
    node scripts/darkroom.mjs --max=50     cap how many photos one pick can bring in (default 200)
*/
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLIDES_JSON = path.join(ROOT, 'slides.json');
const SLIDES_DIR = path.join(ROOT, 'assets', 'slides');
const CONFIG = process.env.DARKROOM_CONFIG || path.join(os.homedir(), '.config', 'inquiredu', 'darkroom.json');
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const PICKER = 'https://photospicker.googleapis.com/v1';
const LONG_EDGE = 1600;

const args = process.argv.slice(2);
const NO_PUSH = args.includes('--no-push');
const MAX = Math.min(2000, Math.max(1, parseInt((args.find(a => a.startsWith('--max=')) || '').slice(6), 10) || 200));

const say = (...m) => console.log(...m);
const die = (msg) => { console.error('\n' + msg); process.exit(1); };
const exists = p => access(p).then(() => true, () => false);

/* ---------- setup ---------- */
async function loadClient() {
  let raw;
  try { raw = JSON.parse(await readFile(CONFIG, 'utf8')); }
  catch {
    die('No Google sign-in setup found at ' + CONFIG + '.\n' +
        'Follow "Slides: one-time setup" in README.md, then save the downloaded client file there.');
  }
  const c = raw.installed || raw.web || raw;   // accepts the JSON Google gives you as-is
  if (!c.client_id) die(CONFIG + ' has no client_id. Download the client file again from Google Cloud.');
  return { id: c.client_id, secret: c.client_secret || '' };
}

function launch(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const argv = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(cmd, argv, { stdio: 'ignore', detached: true }).unref(); } catch {}
}

/* ---------- Google sign-in (loopback + PKCE, nothing stored) ---------- */
async function signIn(client) {
  const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const server = http.createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const redirect = 'http://127.0.0.1:' + server.address().port + '/callback';

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sign-in timed out after 5 minutes.')), 5 * 60 * 1000);
    server.on('request', (req, res) => {
      const u = new URL(req.url, redirect);
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><title>Darkroom</title><body style="font:16px system-ui;padding:40px;background:#142434;color:#F4F1EB">' +
        (ok ? 'Signed in. You can close this tab and go back to the terminal.' : 'Sign-in didn’t finish. Go back to the terminal and try again.') + '</body>');
      clearTimeout(timer);
      if (ok) resolve(u.searchParams.get('code'));
      else reject(new Error(u.searchParams.get('error') === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed: ' + (u.searchParams.get('error') || 'no code returned') + '.'));
    });
    const auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: client.id, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
      code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account'
    });
    say('Opening Google sign-in in your browser…');
    say('If nothing opens, paste this into your browser:\n  ' + auth + '\n');
    launch(auth);
  }).finally(() => server.close());

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: client.id, client_secret: client.secret, redirect_uri: redirect,
      grant_type: 'authorization_code', code_verifier: verifier
    })
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new Error('Google didn’t issue a sign-in token: ' + (tok.error_description || tok.error || res.status));
  return tok.access_token;
}

/* ---------- Google Photos Picker ---------- */
async function picker(token, method, p, body) {
  const res = await fetch(PICKER + p, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'DELETE') return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.statusText;
    if (res.status === 403 && /not been used|disabled/i.test(msg)) throw new Error('The Photos Picker API isn’t turned on for your Google Cloud project. Enable it, wait a minute, and try again.');
    throw new Error('Google Photos answered ' + res.status + ': ' + msg);
  }
  return data;
}
const seconds = d => Math.max(1, parseFloat(String(d || '5s')) || 5);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pick(token) {
  const session = await picker(token, 'POST', '/sessions', { pickingConfig: { maxItemCount: String(MAX) } });
  say('Opening Google Photos. Search an album title, a place or a year, pick your photos, then press Done.');
  say('If nothing opens, paste this into your browser:\n  ' + session.pickerUri + '\n');
  launch(session.pickerUri + '/autoclose');

  let s = session;
  const until = Date.now() + seconds(session.pollingConfig && session.pollingConfig.timeoutIn) * 1000;
  process.stdout.write('Waiting for your picks');
  while (!s.mediaItemsSet) {
    if (Date.now() > until) { process.stdout.write('\n'); throw new Error('Google Photos stopped waiting for picks. Run the command again.'); }
    await sleep(seconds(s.pollingConfig && s.pollingConfig.pollInterval) * 1000);
    process.stdout.write('.');
    s = await picker(token, 'GET', '/sessions/' + session.id);
  }
  process.stdout.write('\n');

  const items = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ sessionId: session.id, pageSize: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await picker(token, 'GET', '/mediaItems?' + q);
    items.push(...(page.mediaItems || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return { sessionId: session.id, items };
}

/* ---------- JPEG handling: strip metadata, read size and orientation ---------- */
/* Keeps the image data, JFIF header, color profile (APP2) and Adobe marker (APP14).
   Drops EXIF and XMP (APP1, where GPS lives), every other APPn, and comments. */
export function stripJpeg(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('not a JPEG');
  const keep = [buf.subarray(0, 2)];
  let i = 2, width = 0, height = 0, orientation = 1;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) throw new Error('unexpected JPEG structure');
    let m = buf[i + 1];
    while (m === 0xFF) { i++; m = buf[i + 1]; }
    if (m === 0xDA) { keep.push(buf.subarray(i)); break; }          // start of scan: the rest is image data
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { keep.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { height = buf.readUInt16BE(i + 5); width = buf.readUInt16BE(i + 7); }
    if (m === 0xE1) orientation = exifOrientation(seg) || orientation;
    const drop = (m >= 0xE1 && m <= 0xEF && m !== 0xE2 && m !== 0xEE) || m === 0xFE;
    if (!drop) keep.push(seg);
    i += 2 + len;
  }
  return { data: Buffer.concat(keep), width, height, orientation };
}
function exifOrientation(seg) {
  // seg: FF E1 len(2) "Exif\0\0" TIFF…
  if (seg.toString('latin1', 4, 10) !== 'Exif\0\0') return 0;
  const t = 10, le = seg.toString('latin1', t, t + 2) === 'II';
  const u16 = o => le ? seg.readUInt16LE(o) : seg.readUInt16BE(o);
  const u32 = o => le ? seg.readUInt32LE(o) : seg.readUInt32BE(o);
  try {
    const ifd = t + u32(t + 4), n = u16(ifd);
    for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) return u16(e + 8); }
  } catch {}
  return 0;
}
function sips(argv) { execFileSync('/usr/bin/sips', argv, { stdio: 'ignore' }); }

async function develop(token, item, out) {
  const f = item.mediaFile || {};
  if (!f.baseUrl) throw new Error('no download address');
  const res = await fetch(f.baseUrl + '=w' + LONG_EDGE + '-h' + LONG_EDGE, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('download failed (' + res.status + ')');
  let buf = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') || '').split(';')[0];

  if (type !== 'image/jpeg') {                       // PNG, WebP, HEIC: convert with macOS's sips
    if (process.platform !== 'darwin') throw new Error('got ' + type + '; converting it needs macOS');
    const tmp = path.join(os.tmpdir(), 'darkroom-' + crypto.randomBytes(6).toString('hex'));
    await writeFile(tmp, buf);
    sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', tmp, '--out', tmp + '.jpg']);
    buf = await readFile(tmp + '.jpg');
    await unlink(tmp).catch(() => {}); await unlink(tmp + '.jpg').catch(() => {});
  }

  let j = stripJpeg(buf);
  const turn = { 3: '180', 6: '90', 8: '270' }[j.orientation];
  if (turn) {                                           // EXIF said "rotate"; bake it in before the EXIF is gone
    if (process.platform !== 'darwin') throw new Error('needs rotating, which needs macOS');
    await writeFile(out, buf);
    sips(['-r', turn, out]);
    j = stripJpeg(await readFile(out));
  }
  await writeFile(out, j.data);
  return { width: j.width, height: j.height };
}

/* ---------- git ---------- */
function git(argv, opts = {}) { return execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit' }); }

/* ---------- main ---------- */
async function main() {
  const client = await loadClient();
  const data = await exists(SLIDES_JSON) ? JSON.parse(await readFile(SLIDES_JSON, 'utf8')) : { version: 1, updated: '', tray: 24, slides: [] };
  data.slides = data.slides || [];
  const known = new Set(data.slides.map(s => s.id));

  const token = await signIn(client);
  const { sessionId, items } = await pick(token);
  const photos = items.filter(it => it.type === 'PHOTO' || (it.mediaFile && /^image\//.test(it.mediaFile.mimeType || '')));
  const skippedVideo = items.length - photos.length;
  say('You picked ' + items.length + (items.length === 1 ? ' item' : ' items') + (skippedVideo ? ' (' + skippedVideo + ' video' + (skippedVideo === 1 ? '' : 's') + ' skipped)' : '') + '.');

  await mkdir(SLIDES_DIR, { recursive: true });
  const added = [];
  let n = 0;
  for (const it of photos) {
    n++;
    const id = crypto.createHash('sha1').update(String(it.id)).digest('hex').slice(0, 10);
    if (known.has(id)) { say('  ' + n + '/' + photos.length + '  already in the collection'); continue; }
    const takenAt = (it.createTime || '').slice(0, 7);          // "2019-07"
    const file = (takenAt || 'undated') + '-' + id + '.jpg';
    try {
      const size = await develop(token, it, path.join(SLIDES_DIR, file));
      const slide = { id, src: 'assets/slides/' + file, width: size.width, height: size.height, taken: takenAt, caption: '', alt: '' };
      added.push(slide); known.add(id);
      say('  ' + n + '/' + photos.length + '  ' + file + '  ' + size.width + '×' + size.height);
    } catch (e) {
      say('  ' + n + '/' + photos.length + '  skipped: ' + e.message);
    }
  }
  await picker(token, 'DELETE', '/sessions/' + sessionId).catch(() => {});

  if (!added.length) { say('\nNothing new to add.'); return; }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const yes = async q => /^y(es)?$/i.test((await rl.question(q)).trim());

  if (await yes('\nCaption them now? Each photo opens in Preview while you type. [y/N] ')) {
    say('Press Return to leave a field empty. The caption shows on the label; the description is read aloud by screen readers.');
    for (const s of added) {
      if (process.platform === 'darwin') launch(path.join(ROOT, s.src));
      say('\n' + s.src);
      s.caption = (await rl.question('  Caption (short, e.g. Lake Superior): ')).trim();
      s.alt = (await rl.question('  Description for screen readers: ')).trim();
    }
  }

  data.slides = added.concat(data.slides);
  data.updated = new Date().toISOString().slice(0, 10);
  if (!data.tray) data.tray = 24;
  await writeFile(SLIDES_JSON, JSON.stringify(data, null, 2) + '\n');
  say('\nAdded ' + added.length + ' to slides.json (' + data.slides.length + ' in the collection).');

  let inRepo = true;
  try { git(['rev-parse', '--is-inside-work-tree'], { quiet: true }); } catch { inRepo = false; }
  if (!inRepo) { rl.close(); say('This folder isn’t a git repository, so nothing was committed.'); return; }

  git(['add', 'slides.json', ...added.map(s => s.src)]);
  git(['commit', '-q', '-m', 'Slides: add ' + added.length + ' from Google Photos']);
  say('Committed.');

  if (NO_PUSH) { rl.close(); say('Not pushed (--no-push). Run git push when you’re ready.'); return; }
  const go = await yes('Publish ' + added.length + (added.length === 1 ? ' photo' : ' photos') + ' to the public site now? [y/N] ');
  rl.close();
  if (!go) { say('Not pushed. Run git push when you’re ready.'); return; }
  git(['pull', '--rebase', '-q']);
  git(['push', '-q']);
  say('Published. The projector shows them after GitHub Pages rebuilds, usually within a minute or two.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => die(e.message || String(e)));
}
