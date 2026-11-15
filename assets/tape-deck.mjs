import {musicSource} from './creative-sources.mjs';
import {createFocusView} from './focus-view.mjs?v=20261115.16';
import {mountMusicVisualizer} from './music-visualizer.mjs?v=20261115.16';

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
    controller.addListener('playback_update', ({data}) => {
      if (!data || signal.aborted) return;
      started ||= !data.isPaused || Number(data.position) > 0;
      update({
        position: Number(data.position) || 0,
        duration: Number(data.duration) || 0,
        playing: !data.isPaused,
        buffering: Boolean(data.isBuffering)
      });
    });
    controller.addListener('ready', () => {
      if (signal.aborted) return;
      const iframe = player.querySelector('iframe');
      if (iframe) iframe.title = title + ' — Spotify player';
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
  iframe.title = title + ' — SoundCloud player';
  iframe.height = source.height;
  iframe.allow = 'autoplay';
  player.replaceChildren(iframe);

  const widget = window.SC.Widget(iframe);
  const events = window.SC.Widget.Events;
  const measure = () => widget.getDuration(duration => {
    if (!signal.aborted) update({duration: Number(duration) || 0});
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

function clock(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

export function mountTapeDeck(container, items, sources = {}) {
  mounts.get(container)?.();
  container.replaceChildren();
  if (!items.length) return;

  const entries = items.map(item => ({item, source: musicSource(item.url)}));
  const room = element('div', 'listening-room');
  const shelf = element('ul', 'listening-library');
  shelf.setAttribute('aria-label', 'Listening selections');
  const dock = element('div', 'listening-dock');
  room.append(shelf, dock);
  container.append(room);

  const focus = createFocusView({
    container: dock,
    label: 'Listening player',
    kind: 'music',
    buttonLabel: 'Player'
  });
  const actions = element('div', 'listening-actions');
  actions.append(focus.button);
  dock.prepend(actions);

  const playerBody = element('div', 'listening-player');
  const readout = element('div', 'listening-readout');
  const artwork = element('span', 'listening-cassette');
  artwork.setAttribute('aria-hidden', 'true');
  artwork.append(element('i'), element('i'));
  const metadata = element('div', 'listening-metadata');
  const title = element('h3', 'listening-title');
  const provider = element('span', 'listening-provider');
  metadata.append(title, provider);
  readout.append(artwork, metadata);

  const transport = element('div', 'listening-transport');
  transport.setAttribute('role', 'group');
  transport.setAttribute('aria-label', 'Playback controls');
  const back = button('−15s', 'listening-seek');
  back.setAttribute('aria-label', 'Back 15 seconds');
  const play = button('Play', 'listening-play');
  const forward = button('+15s', 'listening-seek');
  forward.setAttribute('aria-label', 'Forward 15 seconds');
  const progress = element('progress', 'listening-progress');
  progress.setAttribute('aria-label', 'Playback progress');
  const time = element('span', 'listening-time');
  transport.append(play, back, forward, progress, time);

  const status = element('p', 'listening-status');
  status.setAttribute('role', 'status');
  const player = element('div', 'source-player listening-provider-player');
  const details = element('div', 'listening-details');

  const playerInterface = element('div', 'listening-interface');
  playerInterface.append(readout, transport, status);
  playerBody.append(playerInterface);
  focus.body.append(playerBody);
  const visualizer = mountMusicVisualizer(playerBody);
  playerBody.append(player, details);

  const profiles = element('div', 'listening-profiles');
  for (const [key, label] of [['spotify', 'Spotify'], ['soundcloud', 'SoundCloud']]) {
    if (sources[key]) profiles.append(link(label + ' profile ↗', sources[key]));
  }
  if (profiles.childElementCount) container.append(profiles);

  let index = -1;
  let session = null;
  let playRequested = false;
  let state = {playing: false, buffering: false, position: 0, duration: 0};
  const lifecycle = new AbortController();

  function paint() {
    const source = entries[index].source;
    const pending = Boolean(session && !session.controls && playRequested);
    const canSeek = Boolean(session?.controls?.canSeek && state.duration);
    transport.hidden = !source;
    play.disabled = pending;
    const label = state.playing ? 'Pause' : pending ? 'Opening…' : 'Play';
    if (play.textContent !== label) play.textContent = label;
    back.hidden = forward.hidden = !canSeek;
    progress.hidden = time.hidden = !state.duration;
    if (state.duration) {
      progress.max = state.duration;
      progress.value = state.position;
      const elapsed = clock(state.position) + ' / ' + clock(state.duration);
      if (time.textContent !== elapsed) time.textContent = elapsed;
    }
    const moving = state.playing && !state.buffering;
    playerBody.classList.toggle('is-playing', moving);
    visualizer.setPlaying(moving);
  }

  function announce(message) {
    if (status.textContent !== message) status.textContent = message;
  }

  function updatePlayback(attempt, update) {
    if (session !== attempt || attempt.load.signal.aborted) return;
    Object.assign(state, update);
    paint();
    if (!attempt.controls || !('playing' in update)) return;
    if (state.buffering) announce('Buffering…');
    else if (state.playing) announce('Playing on ' + entries[index].source.provider + '.');
    else announce('');
  }

  function discardPlayer() {
    const previous = session;
    session = null;
    playRequested = false;
    previous?.load.abort();
    player.replaceChildren();
    player.hidden = true;
  }

  function ensurePlayer() {
    const {item, source} = entries[index];
    if (!source || session) return;
    const load = new AbortController();
    const attempt = {load, controls: null};
    session = attempt;
    player.hidden = false;
    announce('Opening ' + source.provider + '…');
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
      if (playRequested) {
        controls.play();
        playRequested = false;
      }
      paint();
    }).catch(error => {
      if (session !== attempt) return;
      discardPlayer();
      state = {playing: false, buffering: false, position: 0, duration: 0};
      announce(error.message + ' Try Play again or open the source link.');
      paint();
    }).finally(() => clearTimeout(timeout));
  }

  function choose(nextIndex) {
    if (index === nextIndex) return;
    discardPlayer();
    index = nextIndex;
    state = {playing: false, buffering: false, position: 0, duration: 0};
    const {item, source} = entries[index];
    title.textContent = item.title;
    provider.textContent = source?.provider || 'Track list';
    for (const [i, selection] of selections.entries()) {
      selection.setAttribute('aria-pressed', String(i === index));
    }
    details.replaceChildren();
    if (item.note) details.append(element('p', 'listening-note', item.note));
    if (source) details.append(link('Open in ' + source.provider + ' ↗', source.url));
    if (item.tracks?.length) {
      const tracks = element('ol', 'tracks');
      for (const track of item.tracks) {
        const trackName = [track.title, track.artist].filter(Boolean).join(' — ');
        const row = element('li', '', trackName);
        if (/^https?:\/\//.test(track.url || '')) row.replaceChildren(link(trackName, track.url));
        tracks.append(row);
      }
      details.append(tracks);
    }
    announce('');
    paint();
    if (focus.isFocused()) ensurePlayer();
  }

  const selections = entries.map(({item, source}, i) => {
    const row = element('li');
    const selection = button('', 'listening-choice');
    const name = element('strong', '', item.title);
    const label = element('span', 'listening-choice-provider', source?.provider || 'Track list');
    selection.append(name, label);
    selection.addEventListener('click', () => choose(i));
    row.append(selection);
    shelf.append(row);
    return selection;
  });

  play.addEventListener('click', () => {
    if (session?.controls) {
      if (state.playing) session.controls.pause();
      else session.controls.play();
    } else {
      playRequested = true;
      if (session) paint();
      else ensurePlayer();
    }
  });

  for (const [control, offset] of [[back, -15000], [forward, 15000]]) {
    control.addEventListener('click', () => {
      if (session?.controls?.canSeek && state.duration) {
        session.controls.seek(Math.max(0, Math.min(state.duration, state.position + offset)));
      }
    });
  }

  window.addEventListener('focusview:change', event => {
    if (event.detail.kind !== 'music') return;
    const active = focus.isFocused();
    visualizer.setActive(active);
    if (active) ensurePlayer();
  }, {signal: lifecycle.signal});

  choose(0);
  mounts.set(container, () => {
    lifecycle.abort();
    focus.close();
    discardPlayer();
    visualizer.dispose();
    mounts.delete(container);
  });
}
