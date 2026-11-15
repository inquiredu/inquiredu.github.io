const width = 640;
const height = 100;
const frameInterval = 1000 / 30;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function control(label, input) {
  const node = element('label', 'music-visualizer-control');
  node.append(element('span', '', label), input);
  return node;
}

function drawBars(context, time, intensity) {
  const count = 42;
  const stride = width / count;
  const floor = height - 10;
  for (let i = 0; i < count; i++) {
    const spread = Math.sin(Math.PI * (i + 1) / (count + 1));
    const pulse = (1 + Math.sin(i * 0.44 + time * 2.7)) / 2;
    const variation = (1 + Math.sin(i * 0.79 - time * 1.6)) / 2;
    const rise = Math.max(3, (6 + 69 * spread * (0.15 + 0.55 * pulse + 0.3 * variation)) * intensity);
    const x = i * stride + 2;
    context.fillRect(x, floor - rise, stride - 4, rise);
  }
}

function drawWave(context, time, intensity) {
  const mid = height / 2;
  context.beginPath();
  for (let x = 0; x <= width; x += 4) {
    const position = x / width;
    const falloff = Math.sin(position * Math.PI);
    const ripple = 0.7 * Math.sin(position * 23 - time * 3) + 0.3 * Math.sin(position * 51 + time * 2.2);
    context.lineTo(x, mid + falloff * ripple * 39 * intensity);
  }
  context.stroke();
}

export function mountMusicVisualizer(parent) {
  const section = element('section', 'music-visualizer');
  section.hidden = true;
  const heading = element('h4', '', 'Ambient visualization');
  const enabled = element('input');
  enabled.type = 'checkbox';
  enabled.checked = true;
  const mode = element('select');
  for (const name of ['Bars', 'Wave']) mode.append(element('option', '', name));
  const intensity = element('input');
  intensity.type = 'range';
  intensity.min = '20';
  intensity.max = '110';
  intensity.value = '66';
  const motion = element('select');
  for (const [label, speed] of [['Still', '0'], ['Gentle', '1'], ['Lively', '1.65']]) {
    const option = element('option', '', label);
    option.value = speed;
    motion.append(option);
  }
  motion.value = '1';
  const controls = element('div', 'music-visualizer-controls');
  controls.append(control('On', enabled), control('Style', mode), control('Intensity', intensity), control('Motion', motion));

  const canvas = element('canvas', 'music-visualizer-canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return {setActive() {}, setPlaying() {}, dispose() {}};

  const top = element('div', 'music-visualizer-header');
  top.append(heading, controls);
  section.append(top, canvas);
  parent.append(section);

  const stop = new AbortController();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const color = context.createLinearGradient(0, 0, width, height);
  color.addColorStop(0, '#b78b5a');
  color.addColorStop(.5, '#d5ae77');
  color.addColorStop(1, '#a2ab80');

  let active = false;
  let playing = false;
  let visible = typeof IntersectionObserver !== 'function';
  let phase = 0;
  let frame = 0;
  let lastPaint = 0;

  function paint() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    const level = Number(intensity.value) / 100;
    if (mode.value === 'Wave') drawWave(context, phase, level);
    else drawBars(context, phase, level);
  }

  function animate(now) {
    if (!lastPaint || now - lastPaint >= frameInterval) {
      if (lastPaint) phase += Math.min(80, now - lastPaint) / 1000 * Number(motion.value);
      lastPaint = now;
      paint();
    }
    frame = requestAnimationFrame(animate);
  }

  function update() {
    canvas.hidden = !enabled.checked;
    intensity.disabled = mode.disabled = motion.disabled = !enabled.checked;
    const wantsMotion = motion.value !== '0' && !motionPreference.matches;
    const animateNow = active && playing && visible && enabled.checked && !document.hidden && wantsMotion;
    if (animateNow && !frame) frame = requestAnimationFrame(animate);
    if (!animateNow && frame) {
      cancelAnimationFrame(frame);
      frame = lastPaint = 0;
    }
    if (active && enabled.checked) paint();
  }

  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    update();
  }) : null;
  observer?.observe(canvas);

  const register = {signal: stop.signal};
  enabled.addEventListener('change', update, register);
  mode.addEventListener('change', update, register);
  intensity.addEventListener('input', update, register);
  motion.addEventListener('change', update, register);
  motionPreference.addEventListener('change', update, register);
  document.addEventListener('visibilitychange', update, register);

  return {
    setActive(value) {
      active = value;
      section.hidden = !active;
      update();
    },
    setPlaying(value) {
      if (playing === value) return;
      playing = value;
      update();
    },
    dispose() {
      stop.abort();
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    }
  };
}
