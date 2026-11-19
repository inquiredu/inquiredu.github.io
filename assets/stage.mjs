// The viewfinder stage. Rooms sit side by side in a snapping strip; this module turns
// one into frame at a time and keeps the scale, address and focus order in step with it.
// Off-stage rooms stay mounted, so a playing tape keeps playing while you look elsewhere.

const TURN_DEGREES = 24;
const FLOOR = 0.7; // below this, controls and type get too small: the room scrolls instead

export function roomIndex(position, count) {
  if (!(count > 0) || !Number.isFinite(position)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(position)));
}

// How a room `offset` rooms away from the frame should be posed (0 = in frame).
export function roomPose(offset) {
  const distance = Math.abs(offset);
  if (distance < 0.004 || distance >= 1) return null;
  return {
    transform: `perspective(1500px) translateX(${(offset * -7).toFixed(2)}%) rotateY(${(offset * TURN_DEGREES).toFixed(2)}deg) scale(${(1 - distance * 0.08).toFixed(4)})`,
    opacity: (1 - distance * 0.8).toFixed(3)
  };
}

// Can something between `target` and `boundary` still scroll vertically in this direction?
export function scrollsWithin(target, boundary, direction, styleOf = element => getComputedStyle(element)) {
  for (let element = target; element && element !== boundary; element = element.parentElement) {
    if (element.scrollHeight - element.clientHeight <= 1) continue;
    if (!/auto|scroll/.test(styleOf(element).overflowY)) continue;
    if (direction > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : element.scrollTop > 0) return true;
  }
  return false;
}

// The zoom that lets `natural` pixels of room fit `available`, never below a legible floor.
export function fitZoom(available, natural, floor = FLOOR) {
  if (!(available > 0) || !(natural > 0) || natural <= available) return 1;
  return Math.max(floor, Math.floor((available / natural) * 100) / 100);
}

function mountStage(document) {
  const window = document.defaultView;
  const stage = document.getElementById('room');
  const scale = document.getElementById('finderScale');
  if (!stage || !scale) return;

  const marker = scale.querySelector('.finder-index');
  const readout = document.getElementById('finderReadout');
  const status = document.getElementById('finderStatus');
  const steps = [...document.querySelectorAll('.finder-step')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const allRooms = [...stage.querySelectorAll(':scope > .scene')];
  const rooms = () => allRooms.filter(room => !room.hidden);
  const linkFor = room => scale.querySelector(`a[href="#${room.id}"]`);
  const nameOf = room => linkFor(room)?.textContent.trim() || room.id;

  let current = null;
  let visitorMoved = false;
  let wanted = window.location.hash.slice(1);
  let frame = 0;
  let settleTimer = 0;

  function paint() {
    frame = 0;
    const list = rooms();
    if (!list.length) return;
    const position = stage.scrollLeft / (stage.clientWidth || 1);
    list.forEach((room, index) => {
      const pose = reducedMotion.matches ? null : roomPose(index - position);
      const inner = room.firstElementChild;
      inner.style.transform = pose ? pose.transform : '';
      inner.style.opacity = pose ? pose.opacity : '';
    });

    const from = Math.min(list.length - 1, Math.max(0, Math.floor(position)));
    const to = Math.min(list.length - 1, from + 1);
    const blend = Math.min(1, Math.max(0, position - from));
    const a = linkFor(list[from]);
    const b = linkFor(list[to]);
    if (a && b && marker) {
      marker.style.transform = `translateX(${a.offsetLeft + (b.offsetLeft - a.offsetLeft) * blend}px)`;
      marker.style.width = `${a.offsetWidth + (b.offsetWidth - a.offsetWidth) * blend}px`;
    }

    const nearest = list[roomIndex(position, list.length)];
    if (nearest !== current) frameRoom(nearest, list);
  }

  // Scale a room down to sit whole inside the frame.
  let fitting = 0;
  function fit(room) {
    const inner = room.firstElementChild;
    if (room.hidden || room.classList.contains('scene-photographs')) return; // the photograph sizes itself
    const style = window.getComputedStyle(room);
    let available = room.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    // Anything after the room's object (the home footer) shares the frame when there is height to spare.
    if (room.clientHeight > 520) for (let extra = inner.nextElementSibling; extra; extra = extra.nextElementSibling) available -= extra.getBoundingClientRect().height + parseFloat(window.getComputedStyle(extra).marginTop);
    fitting = window.performance.now();
    inner.style.zoom = '';
    // Layouts reflow as they shrink, so height is not a smooth function of zoom:
    // start from the estimate and step down until the room really fits.
    let zoom = fitZoom(available, inner.getBoundingClientRect().height);
    while (zoom < 1) {
      inner.style.zoom = String(zoom);
      if (inner.getBoundingClientRect().height <= available + 0.5) break;
      // A room that cannot fit at a legible size keeps its natural size and scrolls.
      zoom = zoom <= FLOOR ? 1 : Math.max(FLOOR, Math.round((zoom - 0.03) * 100) / 100);
    }
    inner.style.zoom = zoom < 1 ? String(zoom) : '';
  }
  function fitAll() { rooms().forEach(fit); }

  function schedule() {
    if (!frame) frame = window.requestAnimationFrame(paint);
  }

  function frameRoom(room, list = rooms()) {
    current = room;
    const index = list.indexOf(room);
    for (const other of allRooms) linkFor(other)?.toggleAttribute('aria-current', other === room);
    linkFor(room)?.setAttribute('aria-current', 'true');
    if (readout) readout.textContent = `${String(index + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')} · ${nameOf(room)}`;
    steps.forEach(step => { step.disabled = Number(step.dataset.step) < 0 ? index === 0 : index === list.length - 1; });
    schedule(); // link widths can change with the current room on narrow bars
  }

  function settle() {
    if (!current) return;
    for (const room of allRooms) room.inert = room !== current;
    if (status) status.textContent = `${nameOf(current)} in view`;
    if (visitorMoved && window.location.hash !== '#draft' && window.location.hash !== `#${current.id}`) {
      window.history.replaceState(null, '', `#${current.id}`);
    }
  }

  function go(room, { instant = false } = {}) {
    const list = rooms();
    const index = list.indexOf(room);
    if (index < 0) return false;
    room.inert = false;
    stage.scrollTo({ left: index * stage.clientWidth, behavior: instant || reducedMotion.matches ? 'instant' : 'smooth' });
    if (instant) { paint(); settle(); }
    return true;
  }

  function step(direction) {
    const list = rooms();
    const next = list[list.indexOf(current) + direction];
    if (!next) return false;
    visitorMoved = true;
    return go(next);
  }

  stage.addEventListener('scroll', () => {
    schedule();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(settle, 160);
  }, { passive: true });
  for (const type of ['pointerdown', 'touchstart']) stage.addEventListener(type, () => { visitorMoved = true; }, { passive: true });

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href^="#"]');
    const room = link && allRooms.find(candidate => `#${candidate.id}` === link.getAttribute('href'));
    if (!room || room.hidden) return;
    event.preventDefault();
    visitorMoved = true;
    go(room);
    if (link.classList.contains('skip-link')) { room.tabIndex = -1; room.focus({ preventScroll: true }); }
  });
  steps.forEach(button => button.addEventListener('click', () => step(Number(button.dataset.step))));

  // Left and right turn the stage unless a control already claimed the key.
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (document.querySelector('dialog:modal') || event.target.closest?.('input, select, textarea, [contenteditable], [role="slider"], [role="listbox"], [role="tablist"]')) return;
    if (step(event.key === 'ArrowRight' ? 1 : -1)) event.preventDefault();
  });

  // A deliberate wheel turn moves one room, but never steals a scroll the room can still use.
  let wheelTravel = 0;
  let wheelIdle = 0;
  let wheelRest = 0;
  stage.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const direction = Math.sign(event.deltaY);
    if (!direction || scrollsWithin(event.target, stage, direction)) return;
    event.preventDefault();
    const now = event.timeStamp;
    if (now < wheelRest) { wheelRest = Math.max(wheelRest, now + 120); return; } // swallow trackpad inertia
    if (now - wheelIdle > 240) wheelTravel = 0;
    wheelIdle = now;
    wheelTravel += event.deltaMode === 1 ? event.deltaY * 32 : event.deltaY;
    if (Math.abs(wheelTravel) < 48) return;
    wheelTravel = 0;
    wheelRest = now + 700;
    step(direction);
  }, { passive: false });

  window.addEventListener('resize', () => { fitAll(); if (current) go(current, { instant: true }); });
  // Rooms change height as they load or open (a tape case, a contact sheet): refit, but not in answer to our own zoom.
  let refit = 0;
  const grown = new ResizeObserver(() => {
    if (window.performance.now() - fitting < 250) return;
    window.clearTimeout(refit);
    refit = window.setTimeout(fitAll, 120);
  });
  for (const room of allRooms) grown.observe(room.firstElementChild);
  window.addEventListener('hashchange', () => {
    const room = allRooms.find(candidate => candidate.id === window.location.hash.slice(1));
    if (room && !room.hidden && room !== current) go(room);
  });

  // Rooms appear once their content loads; honour a deep link that was waiting for one.
  const roomsChanged = new MutationObserver(() => {
    fitAll();
    const room = !visitorMoved && allRooms.find(candidate => candidate.id === wanted && !candidate.hidden);
    if (room && room !== current) go(room, { instant: true });
    else if (current) { frameRoom(current); go(current, { instant: true }); }
  });
  for (const room of allRooms) roomsChanged.observe(room, { attributes: true, attributeFilter: ['hidden'] });

  const first = allRooms.find(room => room.id === wanted && !room.hidden) || rooms()[0];
  fitAll();
  if (first) go(first, { instant: true });
  document.fonts?.ready.then(schedule);

  mountTurnPrompt(document);
}

function mountTurnPrompt(document) {
  const window = document.defaultView;
  const prompt = document.getElementById('turnDevice');
  const skip = document.getElementById('turnDeviceSkip');
  const page = document.querySelector('.page');
  if (!prompt || !skip || !page) return;
  const upright = window.matchMedia('(orientation: portrait) and (max-width: 600px)');
  let declined = false;
  try { declined = window.sessionStorage.getItem('stay-upright') === '1'; } catch {}

  function sync() {
    const show = upright.matches && !declined;
    prompt.hidden = !show;
    page.inert = show;
    if (show) skip.focus({ preventScroll: true });
  }
  skip.addEventListener('click', () => {
    declined = true;
    try { window.sessionStorage.setItem('stay-upright', '1'); } catch {}
    sync();
  });
  upright.addEventListener('change', sync);
  sync();
}

if (typeof document !== 'undefined') mountStage(document);
