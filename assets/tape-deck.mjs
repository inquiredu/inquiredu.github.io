import {musicSource} from './creative-sources.mjs';
import {createFocusView} from './focus-view.mjs?v=20261115.16';
import {mountMusicVisualizer} from './music-visualizer.mjs?v=20261115.16';

/* The deck and expandable track drawer share one persistent provider player.
   Opening the drawer loads the selection without starting playback. */

const mounts = new WeakMap();
const scripts = new Map();
const playerTimeout = 18000;
const sdkTimeout = 12000;
const spotifySdk = 'https://open.spotify.com/embed/iframe-api/v1';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text, className) {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
}

function link(text, url) {
  const node = element('a', '', text);
  node.href = url;
  node.target = '_blank';
  node.rel = 'noopener';
  return node;
}

function sdk(url) {
  if (!scripts.has(url)) {
    const script = element('script');
    script.src = url;
    const ready = new Promise((resolve, reject) => {
      const fail = () => {
        clearTimeout(timeout);
        if (scripts.get(url)?.script === script) scripts.delete(url);
        script.remove();
        reject(Error('The player could not load.'));
      };
      const timeout = setTimeout(fail, sdkTimeout);
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = fail;
      document.head.append(script);
    });
    scripts.set(url, {script, ready});
  }
  return scripts.get(url).ready;
}

let spotifyAPI;
function spotify() {
  if (!spotifyAPI) {
    let timeout;
    spotifyAPI = new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(Error('Spotify did not respond.')), sdkTimeout + 1000);
      window.onSpotifyIframeApiReady = resolve;
      sdk(spotifySdk).catch(reject);
    }).catch(error => {
      spotifyAPI = null;
      scripts.get(spotifySdk)?.script.remove();
      scripts.delete(spotifySdk);
      throw error;
    }).finally(() => clearTimeout(timeout));
  }
  return spotifyAPI;
}

/* Spotify reports which item is playing as a URI; its public oEmbed endpoint gives the name. */
const spotifyNames = new Map();
function spotifyName(uri) {
  const match = /^spotify:(track|episode):([A-Za-z0-9]{22})$/.exec(uri || '');
  if (!match) return Promise.resolve('');
  if (!spotifyNames.has(uri)) {
    const page = `https://open.spotify.com/${match[1]}/${match[2]}`;
    spotifyNames.set(uri, fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(page), {credentials: 'omit', referrerPolicy: 'no-referrer'})
      .then(response => response.ok ? response.json() : {})
      .then(data => typeof data.title === 'string' ? data.title.trim().slice(0, 200) : '')
      .catch(() => {
        spotifyNames.delete(uri);
        return '';
      }));
  }
  return spotifyNames.get(uri);
}

function titleFrame(iframe, title) {
  iframe.title = title;
}

async function connectSpotify(player, source, title, signal, update) {
  const api = await spotify();
  signal.throwIfAborted();
  const mount = element('div');
  player.replaceChildren(mount);
  const id = source.url.split('/').at(-1);

  return new Promise(resolve => api.createController(mount, {
    uri: 'spotify:' + source.kind + ':' + id,
    width: '100%',
    height: source.height
  }, controller => {
    if (signal.aborted) {
      controller.destroy();
      return;
    }
    signal.addEventListener('abort', () => controller.destroy(), {once: true});

    let started = false;
    let nowPlaying = '';
    controller.addListener('playback_update', ({data}) => {
      if (!data || signal.aborted) return;
      started ||= !data.isPaused || Number(data.position) > 0;
      update({
        position: Number(data.position) || 0,
        duration: Number(data.duration) || 0,
        playing: !data.isPaused,
        buffering: Boolean(data.isBuffering)
      });
      const uri = data.playingURI || (['track', 'episode'].includes(source.kind) ? 'spotify:' + source.kind + ':' + id : '');
      if (uri && uri !== nowPlaying) {
        nowPlaying = uri;
        spotifyName(uri).then(name => {
          if (!signal.aborted && nowPlaying === uri && name) update({track: name});
        });
      }
    });
    controller.addListener('ready', () => {
      if (signal.aborted) return;
      const iframe = player.querySelector('iframe');
      if (iframe) titleFrame(iframe, title + ' — Spotify player');
      resolve({
        play: () => started ? controller.resume() : controller.play(),
        pause: () => controller.pause(),
        seek: ms => controller.seek(Math.round(ms / 1000)),
        canSeek: source.kind === 'episode'
      });
    });
  }));
}

async function connectSoundCloud(player, source, title, signal, update) {
  await sdk('https://w.soundcloud.com/player/api.js');
  signal.throwIfAborted();
  const iframe = element('iframe');
  iframe.src = source.embed;
  iframe.height = Math.max(source.height, 420);
  iframe.allow = 'autoplay';
  titleFrame(iframe, title + ' — SoundCloud player');
  player.replaceChildren(iframe);

  const widget = window.SC.Widget(iframe);
  const events = window.SC.Widget.Events;
  const measure = () => widget.getDuration(duration => {
    if (!signal.aborted) update({duration: Number(duration) || 0});
  });
  const name = () => widget.getCurrentSound(sound => {
    if (!signal.aborted && sound && typeof sound.title === 'string') update({track: sound.title.trim().slice(0, 200)});
  });

  return new Promise((resolve, reject) => {
    const listeners = [
      [events.READY, () => {
        measure();
        resolve({
          play: () => widget.play(),
          pause: () => widget.pause(),
          seek: ms => widget.seekTo(ms),
          canSeek: true
        });
      }],
      [events.PLAY, () => {
        update({playing: true});
        measure();
        name();
      }],
      [events.PAUSE, () => update({playing: false})],
      [events.FINISH, () => update({playing: false})],
      [events.PLAY_PROGRESS, event => update({position: Number(event.currentPosition) || 0})]
    ];
    if (events.ERROR) listeners.push([events.ERROR, () => reject(Error('The player could not load.'))]);
    for (const [event, callback] of listeners) widget.bind(event, callback);
    signal.addEventListener('abort', () => {
      widget.pause();
      for (const [event] of listeners) widget.unbind(event);
    }, {once: true});
  });
}

export function tapeAppearance(source, ownerProfile) {
  if (source?.provider === 'Spotify' && source.kind === 'album') return 'album';
  if (source?.provider === 'SoundCloud' && ownerProfile?.provider === 'SoundCloud') {
    const username = source.url.split('/')[3].toLowerCase();
    const owner = ownerProfile.url.split('/')[3].toLowerCase();
    if (username === owner) return 'diy';
  }
  return 'mix';
}

const meterMarkup = channel => `<svg viewBox="0 0 180 96" aria-hidden="true"><path d="M36.4 55 A70 70 0 0 1 119.6 36.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M119.6 36.6 A70 70 0 0 1 143.6 55" fill="none" stroke="#8A2F1C" stroke-width="3.2"/><g stroke="currentColor" stroke-width="1.4"><path d="M36.4 55l-6.2-5.1M55 39.4l-4-6.9M71.9 32.4l-2.1-7.7M90 30v-8M108.1 32.4l2.1-7.7M119.6 36.6l3.4-7.3M130.2 42.7l4.5-6.6M143.6 55l6.2-5.1"/></g><g fill="currentColor" font-family="IBM Plex Mono, monospace" font-size="8.5" text-anchor="middle"><text x="24" y="45">-20</text><text x="47" y="25">-10</text><text x="90" y="17">-3</text><text x="126" y="22">0</text><text x="157" y="45">+3</text><text x="90" y="72" font-size="11" font-weight="600">VU</text><text x="20" y="88" font-size="9" font-weight="600">${channel}</text></g></svg><i class="vu-needle"></i>`;

const keyGlyphs = {
  rew: '<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"><path d="M11 0v12L0 6zM22 0v12L11 6z"/></svg>',
  play: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 0v12l11-6z"/></svg>',
  ff: '<svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true"><path d="M0 0v12l11-6zM11 0v12l11-6z"/></svg>',
  stop: '<svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><rect width="11" height="11"/></svg>',
  eject: '<svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><path d="M7 0l7 8H0z M0 10h14v2H0z"/></svg>'
};

export function mountTapeDeck(container, items, sources = {}) {
  mounts.get(container)?.();
  container.replaceChildren();
  if (!items.length) return;

  const ownerProfile = musicSource(sources.soundcloud);
  const entries = items.map((item, i) => {
    const source = musicSource(item.url);
    const appearance = tapeAppearance(source, ownerProfile);
    let providerLabel = source?.provider || 'Song list';
    if (appearance === 'diy') providerLabel += ' · Original recordings';
    if (appearance === 'album') providerLabel += ' · Album';
    if (source?.provider === 'Spotify' && source.kind === 'playlist') providerLabel += ' · Mixtape';
    return {item, source, appearance, providerLabel, side: i % 2 ? 'B' : 'A', ivory: source?.provider === 'SoundCloud'};
  });

  const room = element('div', 'listening-room deck-room');
  container.append(room);
  const focus = createFocusView({container: room, label: 'Listening room', kind: 'music', buttonLabel: 'Focus view'});
  const actions = element('div', 'listening-actions');
  actions.append(focus.button);
  room.prepend(actions);

  /* the deck */
  const deck = element('div', 'tape-deck');
  for (const corner of ['ds1', 'ds2', 'ds3', 'ds4']) {
    const screw = element('i', 'deck-screw ' + corner);
    screw.setAttribute('aria-hidden', 'true');
    deck.append(screw);
  }
  const header = element('div', 'tape-header');
  const plate = element('div', 'tape-plate');
  plate.setAttribute('aria-hidden', 'true');
  plate.append(element('span', '', 'Stereo cassette deck'), element('span', '', 'Model >0'));
  const status = element('span', 'tape-status', 'Stop');
  header.append(plate, status);

  const body = element('div', 'tape-body');
  const well = element('div', 'tape-well');
  const empty = element('span', 'empty-well', 'No tape');
  empty.setAttribute('aria-hidden', 'true');
  const player = element('div', 'source-player deck-provider');
  const tape = element('div', 'analog-tape');
  tape.setAttribute('aria-hidden', 'true');
  tape.innerHTML = `
    <i class="tape-screw ts1"></i><i class="tape-screw ts2"></i><i class="tape-screw ts3"></i><i class="tape-screw ts4"></i><i class="tape-screw ts5"></i>
    <div class="tape-label">
      <div class="tape-label-top"><b class="tape-side">A</b><span class="tape-title"></span><small>C-90</small></div>
      <div class="tape-stripes"><i></i><i></i></div>
      <div class="tape-label-bottom"><span class="tape-provider"></span><span>Normal · Type I</span></div>
      <div class="tape-window">
        <i class="tape-pack pack-left"></i><i class="tape-pack pack-right"></i>
        <i class="tape-hub hub-left"></i><i class="tape-hub hub-right"></i><i class="tape-ticks"></i>
      </div>
    </div>
    <div class="tape-head"><i></i><i></i><i></i><i></i><i></i></div>`;
  const tapeTitle = tape.querySelector('.tape-title');
  const tapeSide = tape.querySelector('.tape-side');
  const tapeProvider = tape.querySelector('.tape-provider');
  well.append(empty, tape, element('div', 'tape-door'));

  const panel = element('div', 'tape-panel');
  const meters = element('div', 'vu-pair');
  meters.setAttribute('aria-hidden', 'true');
  for (const channel of ['L', 'R']) {
    const meter = element('div', 'vu-meter');
    meter.innerHTML = meterMarkup(channel);
    meters.append(meter);
  }
  const counterRow = element('div', 'counter-row');
  const counter = element('div', 'tape-counter');
  counter.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) counter.append(element('span', '', '0'));
  const readout = element('div', 'tape-readout');
  const readoutLabel = element('small', '', 'Tape counter');
  const nowPlaying = element('span', 'tape-now');
  readout.append(readoutLabel, nowPlaying);
  counterRow.append(counter, readout);

  const keys = element('div', 'tape-keys');
  keys.setAttribute('role', 'group');
  keys.setAttribute('aria-label', 'Transport');
  const buttons = {};
  for (const [key, text, label] of [['rew', 'REW', 'Rewind 15 seconds'], ['play', 'PLAY', 'Play'], ['ff', 'F.FWD', 'Forward 15 seconds'], ['stop', 'STOP', 'Stop'], ['eject', 'EJECT', 'Eject tape']]) {
    const key_ = button('', '');
    key_.dataset.key = key;
    key_.setAttribute('aria-label', label);
    if (key !== 'stop' && key !== 'eject') key_.setAttribute('aria-pressed', 'false');
    key_.innerHTML = keyGlyphs[key];
    key_.append(text);
    buttons[key] = key_;
    keys.append(key_);
  }
  const hint = element('p', 'tape-hint');
  hint.setAttribute('role', 'status');
  panel.append(meters, counterRow, keys, hint);
  body.append(well, panel);
  deck.append(header, body);

  /* the shelf */
  const shelfHead = element('div', 'tape-shelf-head');
  shelfHead.append(element('span', '', 'ON THE SHELF'), element('span', '', 'Pick a tape to load it.'));
  const shelf = element('div', 'tape-shelf');
  shelf.setAttribute('role', 'group');
  shelf.setAttribute('aria-label', 'Tapes on the shelf');
  const spines = entries.map(({item, source, ivory}, i) => {
    const spine = button('', 'tape-spine' + (ivory ? ' ivory' : ''));
    spine.setAttribute('aria-pressed', 'false');
    spine.setAttribute('aria-label', 'Load ' + item.title);
    spine.append(element('i', 'spine-color'), element('small', '', String(i + 1).padStart(2, '0')), element('span', 'spine-title', item.title),
      element('small', '', source?.provider || 'Song list'), element('span', 'shelf-state'));
    spine.addEventListener('click', () => choose(i));
    shelf.append(spine);
    return spine;
  });

  const details = element('div', 'listening-details');
  const trackDrawer = element('section', 'deck-track-drawer');
  const trackHeader = element('div', 'deck-track-header');
  const trackTitle = element('span', 'deck-track-title');
  trackTitle.id = 'deck-track-title';
  const trackToggle = button('Show tracks +', 'deck-track-toggle');
  trackToggle.setAttribute('aria-expanded', 'false');
  trackToggle.setAttribute('aria-controls', 'deck-tracks');
  trackHeader.append(trackTitle, trackToggle);
  const trackPanel = element('div', 'deck-track-panel');
  trackPanel.id = 'deck-tracks';
  trackPanel.setAttribute('role', 'region');
  trackPanel.setAttribute('aria-labelledby', trackTitle.id);
  trackPanel.setAttribute('aria-hidden', 'true');
  trackPanel.inert = true;
  const trackStatus = element('p', 'deck-track-status');
  trackStatus.setAttribute('role', 'status');
  const writtenTracks = element('ol', 'tracks');
  trackPanel.append(trackStatus, writtenTracks, player);
  trackDrawer.append(trackHeader, trackPanel);
  focus.body.append(deck, trackDrawer, shelfHead, shelf);
  const visualizer = mountMusicVisualizer(focus.body);
  focus.body.append(details);

  const profiles = element('div', 'deck-footer');
  profiles.append(element('span', '', 'Selected here. Kept alive at the source.'));
  for (const [key, label] of [['spotify', 'Spotify'], ['soundcloud', 'SoundCloud']]) {
    if (sources[key]) profiles.append(link(label + ' ↗', sources[key]));
  }
  container.append(profiles);

  let index = -1;
  let session = null;
  let playRequested = false;
  let tracksOpen = false;
  let state = {playing: false, buffering: false, position: 0, duration: 0, track: ''};
  const lifecycle = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function paint() {
    const entry = entries[index];
    const loaded = Boolean(entry);
    const pending = Boolean(session && !session.controls && playRequested);
    const moving = state.playing && !state.buffering;
    const canSeek = Boolean(session?.controls?.canSeek && state.duration);
    const label = !loaded ? 'Empty' : pending || state.buffering ? 'Loading' : state.playing ? 'Play' : 'Stop';
    if (status.textContent !== label) status.textContent = label;
    deck.classList.toggle('playing', moving);
    buttons.play.setAttribute('aria-pressed', String(state.playing));
    buttons.play.disabled = !loaded || !entry.source || pending;
    buttons.stop.disabled = !loaded;
    buttons.rew.disabled = buttons.ff.disabled = !canSeek;
    const seconds = Math.min(999, Math.floor(state.position / 1000));
    const digits = String(seconds).padStart(3, '0');
    [...counter.children].forEach((digit, i) => {
      if (digit.textContent !== digits[i]) digit.textContent = digits[i];
    });
    const played = state.duration ? Math.min(1, Math.max(0, state.position / state.duration)) : 0;
    tape.style.setProperty('--pack-left', (23 + 39 * Math.sqrt(1 - played)) / 2.52 + '%');
    tape.style.setProperty('--pack-right', (23 + 39 * Math.sqrt(played)) / 2.52 + '%');
    /* once a track is known, its name goes on the tape */
    const onTape = loaded ? state.track || entry.item.title : '';
    if (tapeTitle.textContent !== onTape) tapeTitle.textContent = onTape;
    tape.classList.toggle('has-track', Boolean(state.track));
    const line = loaded ? 'Side ' + entry.side + ' · ' + (state.track || entry.item.title) : 'Load a tape from the shelf';
    if (nowPlaying.textContent !== line) nowPlaying.textContent = line;
    readoutLabel.textContent = state.track ? 'Now playing' : 'Tape counter';
    visualizer.setPlaying(moving);
  }

  function announce(message) {
    if (hint.textContent !== message) hint.textContent = message;
  }

  function updatePlayback(attempt, update) {
    if (session !== attempt || attempt.load.signal.aborted) return;
    const was = state.track;
    Object.assign(state, update);
    paint();
    if (update.track && update.track !== was) announce('Now playing: ' + update.track + '.');
    else if (attempt.controls && 'playing' in update) {
      if (state.buffering) announce('Buffering…');
      else if (!state.playing) announce('Stopped.');
    }
  }

  function discardPlayer() {
    const previous = session;
    session = null;
    playRequested = false;
    previous?.load.abort();
    player.replaceChildren();
  }

  function ensurePlayer() {
    const {item, source} = entries[index] || {};
    if (!source || session) return;
    const load = new AbortController();
    const attempt = {load, controls: null};
    session = attempt;
    announce('Opening ' + source.provider + '…');
    trackStatus.textContent = 'Loading tracks from ' + source.provider + '…';
    paint();

    const connector = source.provider === 'Spotify' ? connectSpotify : connectSoundCloud;
    const timeout = setTimeout(() => load.abort(Error('The player is taking longer to load.')), playerTimeout);
    const cancelled = new Promise((resolve, reject) => {
      load.signal.addEventListener('abort', () => reject(load.signal.reason), {once: true});
    });
    const connected = connector(player, source, item.title, load.signal, update => updatePlayback(attempt, update));
    Promise.race([connected, cancelled]).then(controls => {
      if (session !== attempt || load.signal.aborted) return;
      attempt.controls = controls;
      announce('');
      trackStatus.textContent = '';
      if (playRequested) {
        controls.play();
        playRequested = false;
      }
      paint();
    }).catch(error => {
      if (session !== attempt) return;
      discardPlayer();
      state = {playing: false, buffering: false, position: 0, duration: 0, track: ''};
      announce(error.message + ' Try Play again, or open it at the source.');
      trackStatus.replaceChildren(document.createTextNode('Tracks could not load. '), link('Open in ' + source.provider + ' ↗', source.url));
      paint();
    }).finally(() => clearTimeout(timeout));
  }

  function showDetails() {
    details.replaceChildren();
    writtenTracks.replaceChildren();
    trackStatus.textContent = '';
    const entry = entries[index];
    trackDrawer.hidden = !entry || !(entry.source || entry.item.tracks?.length);
    if (!entry) return;
    const {item, source} = entry;
    trackTitle.textContent = item.title + ' · Track list';
    if (item.note) details.append(element('p', 'listening-note', item.note));
    if (source) details.append(link('Open in ' + source.provider + ' ↗', source.url));
    if (item.tracks?.length) {
      for (const track of item.tracks) {
        const trackName = [track.title, track.artist].filter(Boolean).join(' — ');
        const row = element('li', '', trackName);
        if (/^https?:\/\//.test(track.url || '')) row.replaceChildren(link(trackName, track.url));
        writtenTracks.append(row);
      }
    }
  }

  function setTracksOpen(open) {
    tracksOpen = open;
    if (!open && trackPanel.contains(document.activeElement)) trackToggle.focus({preventScroll: true});
    trackToggle.textContent = open ? 'Hide tracks −' : 'Show tracks +';
    trackToggle.setAttribute('aria-expanded', String(open));
    trackPanel.setAttribute('aria-hidden', String(!open));
    trackPanel.inert = !open;
    // Keep the iframe connected and sized while tucked away; playback stays in the deck.
    if (open) ensurePlayer();
  }
  trackToggle.addEventListener('click', () => setTracksOpen(!tracksOpen));

  function markShelf() {
    spines.forEach((spine, i) => {
      const inDeck = i === index;
      spine.setAttribute('aria-pressed', String(inDeck));
      spine.querySelector('.shelf-state').textContent = inDeck ? 'In the deck' : '';
    });
  }

  function choose(nextIndex) {
    if (index === nextIndex) return;
    discardPlayer();
    const reload = index >= 0 || tape.classList.contains('ejected');
    index = nextIndex;
    state = {playing: false, buffering: false, position: 0, duration: 0, track: ''};
    const {side, ivory, appearance, providerLabel, item} = entries[index];
    tape.dataset.tapeStyle = appearance;
    tape.classList.toggle('ivory', ivory);
    tapeSide.textContent = side;
    tapeProvider.textContent = appearance === 'diy' ? (item.note?.trim().replace(/\s+/g, ' ') || providerLabel) : providerLabel;
    empty.hidden = true;
    tape.classList.remove('ejected');
    if (reload && !reducedMotion.matches) {
      tape.classList.add('loading');
      requestAnimationFrame(() => requestAnimationFrame(() => tape.classList.remove('loading')));
    }
    markShelf();
    showDetails();
    announce(entries[index].source ? 'Press Play to start ' + item.title + '.' : 'Choose a tape with a source to play it.');
    paint();
    if (tracksOpen) ensurePlayer();
  }

  function eject() {
    discardPlayer();
    index = -1;
    setTracksOpen(false);
    state = {playing: false, buffering: false, position: 0, duration: 0, track: ''};
    tape.classList.add('ejected');
    empty.hidden = false;
    markShelf();
    showDetails();
    announce('No tape loaded.');
    paint();
  }

  buttons.play.addEventListener('click', () => {
    if (index < 0) return;
    if (session?.controls) {
      if (!state.playing) session.controls.play();
    } else {
      playRequested = true;
      if (session) paint();
      else ensurePlayer();
    }
  });
  buttons.stop.addEventListener('click', () => {
    playRequested = false;
    session?.controls?.pause();
    paint();
  });
  buttons.eject.addEventListener('click', eject);
  for (const [key, offset] of [['rew', -15000], ['ff', 15000]]) {
    buttons[key].addEventListener('click', () => {
      if (session?.controls?.canSeek && state.duration) {
        session.controls.seek(Math.max(0, Math.min(state.duration, state.position + offset)));
      }
    });
  }

  window.addEventListener('focusview:change', event => {
    if (event.detail.kind !== 'music') return;
    visualizer.setActive(focus.isFocused());
  }, {signal: lifecycle.signal});

  /* the needles ride the music while it plays */
  const meterTimer = setInterval(() => {
    if (!container.isConnected) return;
    const live = deck.classList.contains('playing') && !reducedMotion.matches && !document.hidden;
    for (const needle of meters.querySelectorAll('.vu-needle')) {
      needle.style.transform = `rotate(${live ? -28 + Math.random() * 52 : -48}deg)`;
    }
  }, 250);

  choose(0);
  mounts.set(container, () => {
    lifecycle.abort();
    clearInterval(meterTimer);
    focus.close();
    discardPlayer();
    visualizer.dispose();
    mounts.delete(container);
  });
}
