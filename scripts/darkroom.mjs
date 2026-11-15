#!/usr/bin/env node
/*
  Darkroom: put photographs on the slide projector at inquiredu.org.

  Drop photos in ~/Pictures/Slideshow (JPEG, HEIC, PNG, or a zip straight from Google
  Photos' "Download all"), then run this. For each new photo it:
    - makes a web-size copy (1600 px on the long edge),
    - turns it the right way up,
    - removes camera and location data,
    - adds it to slides.json.
  Then it offers captions, commits, and publishes after you say yes.
  Originals are never changed; they move into Slideshow/Added once they're in.

  Usage
    node scripts/darkroom.mjs                 use ~/Pictures/Slideshow
    node scripts/darkroom.mjs <folder|zip>    use another folder, or one zip
    node scripts/darkroom.mjs --no-push       stop after the local commit

  Needs macOS (it uses the built-in `sips` to convert and resize).
*/
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { readFile, writeFile, mkdir, readdir, stat, rename, rm, mkdtemp } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLIDES_JSON = path.join(ROOT, 'slides.json');
const SLIDES_DIR = path.join(ROOT, 'assets', 'slides');
const INBOX = path.join(os.homedir(), 'Pictures', 'Slideshow');
const LONG_EDGE = 1600;
const IMAGE = /\.(jpe?g|heic|heif|png|tiff?|webp)$/i;

const say = (...m) => console.log(...m);
const die = msg => { console.error('\n' + msg); process.exit(1); };
const sips = argv => execFileSync('/usr/bin/sips', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const git = (argv, quiet) => execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });
const openInFinder = p => { try { spawn('open', [p], { stdio: 'ignore', detached: true }).unref(); } catch {} };

/* ---------- JPEG: strip metadata, read size and orientation ---------- */
/* Keeps the image data, JFIF header, color profile (APP2) and Adobe marker (APP14).
   Drops EXIF and XMP (APP1, where GPS lives), every other APPn, and comments. */
export function stripJpeg(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('not a JPEG');
  const keep = [buf.subarray(0, 2)];
  let i = 2, width = 0, height = 0, orientation = 1, taken = '';
  while (i < buf.length) {
    if (buf[i] !== 0xFF) throw new Error('unexpected JPEG structure');
    let m = buf[i + 1];
    while (m === 0xFF) { i++; m = buf[i + 1]; }
    if (m === 0xDA) { keep.push(buf.subarray(i)); break; }          // start of scan: the rest is image data
    if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { keep.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { height = buf.readUInt16BE(i + 5); width = buf.readUInt16BE(i + 7); }
    if (m === 0xE1) { const x = exifInfo(seg); orientation = x.orientation || orientation; taken = taken || x.taken; }
    const drop = (m >= 0xE1 && m <= 0xEF && m !== 0xE2 && m !== 0xEE) || m === 0xFE;
    if (!drop) keep.push(seg);
    i += 2 + len;
  }
  return { data: Buffer.concat(keep), width, height, orientation, taken };
}
/* Orientation (IFD0 0x0112) and month taken (Exif 0x9003 DateTimeOriginal, else IFD0 0x0132). */
function exifInfo(seg) {
  const out = { orientation: 0, taken: '' };
  if (seg.toString('latin1', 4, 10) !== 'Exif\0\0') return out;
  const t = 10, le = seg.toString('latin1', t, t + 2) === 'II';
  const u16 = o => le ? seg.readUInt16LE(o) : seg.readUInt16BE(o);
  const u32 = o => le ? seg.readUInt32LE(o) : seg.readUInt32BE(o);
  const month = e => { const m = /^(\d{4}):(\d{2})/.exec(seg.toString('latin1', t + u32(e + 8), t + u32(e + 8) + 7)); return m && m[1] !== '0000' ? m[1] + '-' + m[2] : ''; };
  const entries = ifd => { const n = u16(ifd), list = []; for (let k = 0; k < n; k++) list.push(ifd + 2 + k * 12); return list; };
  try {
    let fallback = '';
    for (const e of entries(t + u32(t + 4))) {
      const tag = u16(e);
      if (tag === 0x0112) out.orientation = u16(e + 8);
      if (tag === 0x0132) fallback = month(e);
      if (tag === 0x8769) for (const x of entries(t + u32(e + 8))) if (u16(x) === 0x9003) out.taken = month(x);
    }
    out.taken = out.taken || fallback;
  } catch {}
  return out;
}

/* ---------- one photo in, one clean web copy out ---------- */
function takenMonth(file) {
  try {
    const m = /creation:\s*(\d{4})[:-](\d{2})/.exec(sips(['-g', 'creation', file]));   // EXIF date taken
    if (m) return m[1] + '-' + m[2];
  } catch {}
  return '';
}
async function develop(src, out) {
  const dims = sips(['-g', 'pixelWidth', '-g', 'pixelHeight', src]).match(/pixel(?:Width|Height):\s*(\d+)/g) || [];
  const longest = Math.max(0, ...dims.map(s => +s.split(':')[1]));
  const argv = ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82'];
  if (longest > LONG_EDGE) argv.push('-Z', String(LONG_EDGE));
  sips([...argv, src, '--out', out]);

  let j = stripJpeg(await readFile(out));
  const taken = j.taken;
  const turn = { 3: '180', 6: '90', 8: '270' }[j.orientation];
  if (turn) { sips(['-r', turn, out]); j = stripJpeg(await readFile(out)); }   // bake the rotation in before its tag is dropped
  await writeFile(out, j.data);
  return { width: j.width, height: j.height, taken };
}

/* ---------- gather photos: a folder (zips inside are opened) or a single zip ---------- */
async function gather(source, scratch) {
  const found = [];
  const walk = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'Added' || e.name === '__MACOSX') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (IMAGE.test(e.name)) found.push({ file: p, original: p });
      else if (/\.zip$/i.test(e.name)) {
        const to = path.join(scratch, 'zip-' + found.length + '-' + crypto.randomBytes(3).toString('hex'));
        execFileSync('/usr/bin/ditto', ['-x', '-k', p, to]);
        const before = found.length;
        await walkZip(to, p);
        if (found.length === before) say('  ' + e.name + ' has no photos in it.');
      }
    }
  };
  const walkZip = async (dir, zip) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === '__MACOSX') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walkZip(p, zip);
      else if (IMAGE.test(e.name)) found.push({ file: p, original: zip });
    }
  };
  const st = await stat(source);
  if (st.isDirectory()) await walk(source);
  else if (/\.zip$/i.test(source)) { const to = path.join(scratch, 'zip'); execFileSync('/usr/bin/ditto', ['-x', '-k', source, to]); await walkZip(to, source); }
  else if (IMAGE.test(source)) found.push({ file: source, original: source });
  return found;
}

async function main() {
  if (process.platform !== 'darwin') die('Darkroom needs macOS: it uses the built-in sips tool to convert and resize photos.');
  const args = process.argv.slice(2);
  const NO_PUSH = args.includes('--no-push');
  const given = args.find(a => !a.startsWith('--'));
  const source = given ? path.resolve(given.replace(/^~(?=$|\/)/, os.homedir())) : INBOX;

  try { await stat(source); }
  catch {
    if (given) die('Couldn’t find ' + source + '.');
    await mkdir(INBOX, { recursive: true });
    openInFinder(INBOX);
    say('Made a Slideshow folder in your Pictures and opened it in Finder.');
    say('Drop your favorite photos in it (or a zip from Google Photos’ "Download all"), then run this again.');
    return;
  }

  const scratch = await mkdtemp(path.join(os.tmpdir(), 'darkroom-'));
  try {
    const photos = await gather(source, scratch);
    if (!photos.length) {
      if (!given) openInFinder(INBOX);
      say('No photos found in ' + source + '. Drop some in (or a Google Photos zip) and run this again.');
      return;
    }

    const data = JSON.parse(await readFile(SLIDES_JSON, 'utf8').catch(() => '{"version":1,"tray":24,"slides":[]}'));
    data.slides = data.slides || [];
    const known = new Set(data.slides.map(s => s.id));
    await mkdir(SLIDES_DIR, { recursive: true });

    say('Developing ' + photos.length + (photos.length === 1 ? ' photo' : ' photos') + '…');
    const added = [], done = new Set();
    let n = 0;
    for (const p of photos) {
      n++;
      const tag = '  ' + String(n).padStart(String(photos.length).length) + '/' + photos.length + '  ' + path.basename(p.file);
      const id = crypto.createHash('sha1').update(await readFile(p.file)).digest('hex').slice(0, 10);
      if (known.has(id)) { say(tag + '  already on the projector'); done.add(p.original); continue; }
      const tmp = path.join(SLIDES_DIR, '.developing-' + id + '.jpg');
      try {
        const size = await develop(p.file, tmp);
        const taken = size.taken || takenMonth(p.file);
        const name = (taken || 'undated') + '-' + id + '.jpg';
        await rename(tmp, path.join(SLIDES_DIR, name));
        added.push({ id, src: 'assets/slides/' + name, width: size.width, height: size.height, taken, caption: '', alt: '' });
        known.add(id); done.add(p.original);
        say(tag + '  ' + size.width + '×' + size.height + (taken ? '  ' + taken : ''));
      } catch (e) {
        await rm(tmp, { force: true });
        say(tag + '  skipped: ' + (e.message || 'couldn’t read it as a photo'));
      }
    }
    /* move originals out of the inbox so the next run only sees new ones */
    if (!given) {
      const shelf = path.join(INBOX, 'Added');
      await mkdir(shelf, { recursive: true });
      for (const o of done) if (o.startsWith(INBOX + path.sep)) await rename(o, path.join(shelf, path.basename(o))).catch(() => {});
    }
    if (!added.length) { say('\nNothing new to add.'); return; }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const yes = async q => /^y(es)?$/i.test((await rl.question(q)).trim());

    if (await yes('\nCaption them now? Each photo opens in Preview while you type. [y/N] ')) {
      say('Press Return to skip. The caption goes on the label tape; the description is read aloud by screen readers.');
      for (const s of added) {
        openInFinder(path.join(ROOT, s.src));
        say('\n' + path.basename(s.src));
        s.caption = (await rl.question('  Caption (short, e.g. Lake Superior): ')).trim();
        s.alt = (await rl.question('  Description: ')).trim();
      }
    }

    data.slides = added.concat(data.slides);
    data.updated = new Date().toISOString().slice(0, 10);
    data.tray = data.tray || 24;
    await writeFile(SLIDES_JSON, JSON.stringify(data, null, 2) + '\n');

    git(['add', 'slides.json', ...added.map(s => s.src)]);
    git(['commit', '-q', '-m', 'Slides: add ' + added.length + (added.length === 1 ? ' photo' : ' photos')]);
    say('\nAdded ' + added.length + ' (' + data.slides.length + ' on the projector in all). Committed.');

    if (NO_PUSH) { rl.close(); say('Not published (--no-push). Run git push when you’re ready.'); return; }
    const go = await yes('Publish to inquiredu.org now? [y/N] ');
    rl.close();
    if (!go) { say('Not published. Run git push when you’re ready.'); return; }
    git(['pull', '--rebase', '-q']);
    git(['push', '-q']);
    say('Published. The projector shows them in a minute or two.');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(e => die(e.message || String(e)));
}
