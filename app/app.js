'use strict';
/* Vice Cover Maker — offline multi-panel GTA 6 style cover studio.
   Single canvas renderer: layouts, colour grades, grain + vignette,
   titles, undo/redo, and PNG export at three sizes. No network use. */

const SAMPLES = [
  { src: 'samples/boulevard.jpg', name: 'Boulevard' },
  { src: 'samples/pier.jpg', name: 'Pier' },
  { src: 'samples/square.jpg', name: 'Square' },
];

const GRADES = {
  sunset:  { stops: [[0, 'rgba(255,120,40,0.28)'], [0.55, 'rgba(255,60,120,0.16)'], [1, 'rgba(40,10,80,0.30)']], tint: 'rgba(255,140,60,0.10)', glow: '#ff7a3c' },
  neon:    { stops: [[0, 'rgba(0,255,220,0.22)'], [0.5, 'rgba(120,0,255,0.18)'], [1, 'rgba(255,0,160,0.26)']], tint: 'rgba(0,255,200,0.08)', glow: '#22d3ee' },
  vice:    { stops: [[0, 'rgba(255,110,200,0.26)'], [0.5, 'rgba(120,200,255,0.14)'], [1, 'rgba(20,20,90,0.32)']], tint: 'rgba(255,110,200,0.10)', glow: '#ff5ec4' },
  gold:    { stops: [[0, 'rgba(255,210,90,0.26)'], [0.55, 'rgba(200,120,20,0.14)'], [1, 'rgba(60,30,0,0.30)']], tint: 'rgba(255,200,80,0.10)', glow: '#f5b942' },
  night:   { stops: [[0, 'rgba(10,10,40,0.34)'], [0.6, 'rgba(20,10,60,0.26)'], [1, 'rgba(0,0,10,0.42)']], tint: 'rgba(60,80,255,0.08)', glow: '#8aa2ff' },
};

const LAYOUTS = ['hero3', 'grid4', 'full', 'snapshots', 'grid9'];

const PANEL_COUNT = { hero3: 4, grid4: 4, full: 1, snapshots: 4, grid9: 9 };

/* Panel rectangles for a layout, in cover coordinates. */
function layoutRects(layout, W, H) {
  const g = Math.round(Math.min(W, H) * 0.02); // gutter
  switch (layout) {
    case 'hero3': {
      const heroW = Math.round(W * 0.62);
      const sideW = W - heroW - g;
      const sh = Math.round((H - 2 * g) / 3);
      return [
        { x: 0, y: 0, w: heroW, h: H, rot: 0 },
        { x: heroW + g, y: 0, w: sideW, h: sh, rot: 0 },
        { x: heroW + g, y: sh + g, w: sideW, h: sh, rot: 0 },
        { x: heroW + g, y: 2 * (sh + g), w: sideW, h: H - 2 * (sh + g), rot: 0 },
      ];
    }
    case 'grid4': {
      const cw = Math.round((W - g) / 2), ch = Math.round((H - g) / 2);
      return [
        { x: 0, y: 0, w: cw, h: ch, rot: 0 },
        { x: cw + g, y: 0, w: W - cw - g, h: ch, rot: 0 },
        { x: 0, y: ch + g, w: cw, h: H - ch - g, rot: 0 },
        { x: cw + g, y: ch + g, w: W - cw - g, h: H - ch - g, rot: 0 },
      ];
    }
    case 'full':
      return [{ x: 0, y: 0, w: W, h: H, rot: 0 }];
    case 'snapshots': {
      const cw = Math.round(W * 0.44), ch = Math.round(H * 0.42);
      const cx = Math.round((W - 2 * cw) / 3), cy = Math.round((H - 2 * ch) / 3);
      return [
        { x: cx, y: cy, w: cw, h: ch, rot: -6 },
        { x: 2 * cx + cw, y: cy, w: cw, h: ch, rot: 4 },
        { x: cx, y: 2 * cy + ch, w: cw, h: ch, rot: 3 },
        { x: 2 * cx + cw, y: 2 * cy + ch, w: cw, h: ch, rot: -4 },
      ];
    }
    case 'grid9': {
      const cw = Math.round((W - 2 * g) / 3), ch = Math.round((H - 2 * g) / 3);
      const rects = [];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          rects.push({
            x: c * (cw + g), y: r * (ch + g),
            w: c === 2 ? W - 2 * (cw + g) : cw,
            h: r === 2 ? H - 2 * (ch + g) : ch, rot: 0,
          });
        }
      }
      return rects;
    }
    default:
      return layoutRects('hero3', W, H);
  }
}

/* ---- state ---- */
function blankPanel(i) {
  return { photo: i, ox: 0, oy: 0, scale: 1, rot: 0 };
}

const state = {
  layout: 'hero3',
  grade: 'sunset',
  title: 'VICE CITY',
  subtitle: 'welcome to the sunshine state',
  grain: 35,
  vignette: 55,
  photos: [],
  panels: [blankPanel(0), blankPanel(1), blankPanel(2), blankPanel(3)],
  selected: 0,
};

function ensurePanels() {
  const n = PANEL_COUNT[state.layout] || 4;
  while (state.panels.length < n) state.panels.push(blankPanel(state.panels.length));
  state.panels.length = n;
  if (state.selected >= n) state.selected = 0;
}

/* ---- undo / redo ---- */
const undoStack = [];
const redoStack = [];
const MAX_UNDO = 12;

function snapshot() {
  return JSON.stringify({
    layout: state.layout, grade: state.grade, title: state.title,
    subtitle: state.subtitle, grain: state.grain, vignette: state.vignette,
    photos: state.photos, panels: state.panels, selected: state.selected,
  });
}
function restore(json) {
  const s = JSON.parse(json);
  Object.assign(state, s);
  ensurePanels();
  syncControls();
  render();
}
function commit() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  updateUndoButtons();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  updateUndoButtons();
}

/* ---- image loading ---- */
const imageCache = new Map();
function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('cannot load ' + src));
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

/* ---- grain pattern ---- */
let noiseCanvas = null;
function getNoise() {
  if (noiseCanvas) return noiseCanvas;
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = 140;
  noiseCanvas.height = 140;
  const nctx = noiseCanvas.getContext('2d');
  const data = nctx.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.floor(Math.random() * 256);
    data.data[i] = v; data.data[i + 1] = v; data.data[i + 2] = v; data.data[i + 3] = 255;
  }
  nctx.putImageData(data, 0, 0);
  return noiseCanvas;
}

/* ---- drawing ---- */
function drawPhoto(ctx, img, rect, panel) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const base = Math.max(rect.w / iw, rect.h / ih) * panel.scale;
  const dw = iw * base, dh = ih * base;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(rect.x + rect.w / 2 + panel.ox, rect.y + rect.h / 2 + panel.oy);
  ctx.rotate(((panel.rot + (rect.rot || 0)) * Math.PI) / 180);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

/* Colour grade: canvas gradient wash + tint, named to read as a grade. */
function applyGrade(ctx, W, H, gradeName) {
  const g = GRADES[gradeName] || GRADES.sunset;
  const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
  for (const [stop, color] of g.stops) grad.addColorStop(stop, color);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = g.tint;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function applyGrain(ctx, W, H, amount) {
  if (amount <= 0) return;
  const pattern = ctx.createPattern(getNoise(), 'repeat');
  ctx.save();
  ctx.globalAlpha = (amount / 100) * 0.45;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function applyVignette(ctx, W, H, amount) {
  if (amount <= 0) return;
  const r = Math.hypot(W, H) / 2;
  const grad = ctx.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${(amount / 100) * 0.85})`);
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawTitles(ctx, W, H) {
  const g = GRADES[state.grade] || GRADES.sunset;
  const pad = Math.round(W * 0.045);
  const titleSize = Math.round(W * 0.105);
  const subSize = Math.round(W * 0.038);
  const baseY = H - pad;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  // Neon subtitle sits above the main title.
  ctx.font = `${subSize}px Pacifico, cursive`;
  ctx.shadowColor = g.glow;
  ctx.shadowBlur = Math.round(subSize * 0.9);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(state.subtitle, pad, baseY - titleSize - Math.round(subSize * 0.4));
  ctx.shadowBlur = 0;
  // Main title in heavy Anton.
  ctx.font = `${titleSize}px Anton, sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = Math.round(titleSize * 0.12);
  ctx.shadowOffsetY = Math.round(titleSize * 0.05);
  const grad = ctx.createLinearGradient(0, baseY - titleSize, 0, baseY);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#ffd7ef');
  grad.addColorStop(1, '#ff2e88');
  ctx.fillStyle = grad;
  ctx.fillText(state.title.toUpperCase(), pad, baseY);
  ctx.restore();
}

/* Full cover render onto any canvas at any size. */
let renderToken = 0;
async function renderCover(canvas, W, H, st) {
  const token = ++renderToken;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0614';
  ctx.fillRect(0, 0, W, H);
  const rects = layoutRects(st.layout, W, H);
  const jobs = rects.map(async (rect, i) => {
    const panel = st.panels[i];
    if (!panel) return;
    const photo = st.photos[panel.photo];
    if (!photo) return;
    try {
      const img = await loadImage(photo.src);
      if (token !== renderToken) return;
      drawPhoto(ctx, img, rect, panel);
    } catch (e) { /* missing photo: leave the dark panel */ }
  });
  await Promise.all(jobs);
  if (token !== renderToken) return;
  applyGrade(ctx, W, H, st.grade);
  applyGrain(ctx, W, H, st.grain);
  applyVignette(ctx, W, H, st.vignette);
  drawTitles(ctx, W, H);
}

/* ---- editor ---- */
const canvas = document.getElementById('cover');
const PREVIEW_W = 1080, PREVIEW_H = 1080;
let rendering = false;
let renderQueued = false;

async function render() {
  if (rendering) { renderQueued = true; return; }
  rendering = true;
  try { await renderCover(canvas, PREVIEW_W, PREVIEW_H, state); }
  finally {
    rendering = false;
    if (renderQueued) { renderQueued = false; render(); }
  }
  drawSelection();
}

function drawSelection() {
  // Selection ring is drawn as a DOM overlay is complex; instead re-stroke
  // the selected panel rect on a second pass after the cover is painted.
  // We keep it cheap: paint the ring directly on the preview canvas.
  const ctx = canvas.getContext('2d');
  const rects = layoutRects(state.layout, PREVIEW_W, PREVIEW_H);
  const rect = rects[state.selected];
  if (!rect) return;
  ctx.save();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 10]);
  ctx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);
  ctx.restore();
}

function syncControls() {
  document.querySelectorAll('#layout-row button').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('#grade-row button').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.getElementById('inp-title').value = state.title;
  document.getElementById('inp-sub').value = state.subtitle;
  document.getElementById('rng-grain').value = state.grain;
  document.getElementById('rng-vignette').value = state.vignette;
  document.getElementById('grain-val').textContent = state.grain + '%';
  document.getElementById('vig-val').textContent = state.vignette + '%';
  const panel = state.panels[state.selected];
  if (panel) {
    document.getElementById('rng-zoom').value = Math.round(panel.scale * 100);
    document.getElementById('zoom-val').textContent = Math.round(panel.scale * 100) + '%';
    document.getElementById('rng-rot').value = panel.rot;
    document.getElementById('rot-val').textContent = panel.rot + '°';
  }
  const sel = document.getElementById('sel-photo');
  sel.innerHTML = '';
  state.photos.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${i + 1}. ${p.name}`;
    sel.appendChild(opt);
  });
  if (panel) sel.value = String(panel.photo);
  const strip = document.getElementById('panel-strip');
  strip.innerHTML = '';
  state.panels.forEach((p, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'panel-chip' + (i === state.selected ? ' active' : '');
    chip.textContent = `Panel ${i + 1} — ${state.photos[p.photo] ? state.photos[p.photo].name : 'empty'}`;
    chip.addEventListener('click', () => { state.selected = i; syncControls(); render(); });
    strip.appendChild(chip);
  });
}

function updateUndoButtons() {
  document.getElementById('btn-undo').disabled = undoStack.length === 0;
  document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

async function addPhotos(files) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  commit();
  for (const file of list) {
    const src = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsDataURL(file);
    });
    state.photos.push({ src, name: file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Photo' });
  }
  // New photos fill empty panels first.
  state.panels.forEach((p) => {
    if (!state.photos[p.photo] && state.photos.length) p.photo = 0;
  });
  syncControls();
  render();
}

async function loadSamples() {
  commit();
  state.photos = SAMPLES.map((s) => ({ src: s.src, name: s.name }));
  state.panels.forEach((p, i) => { p.photo = i % state.photos.length; });
  syncControls();
  await render();
}

/* ---- export ---- */
function exportPNG(W, H, filename) {
  const off = document.createElement('canvas');
  renderCover(off, W, H, state).then(() => {
    off.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });
}

/* ---- events ---- */
function bindEvents() {
  document.getElementById('file-input').addEventListener('change', (e) => {
    addPhotos(e.target.files);
    e.target.value = '';
  });
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    addPhotos(e.dataTransfer.files);
  });

  document.getElementById('layout-row').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-layout]');
    if (!b) return;
    commit();
    state.layout = b.dataset.layout;
    ensurePanels();
    syncControls();
    render();
  });
  document.getElementById('grade-row').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-grade]');
    if (!b) return;
    commit();
    state.grade = b.dataset.grade;
    syncControls();
    render();
  });

  document.getElementById('inp-title').addEventListener('input', (e) => {
    state.title = e.target.value;
    render();
  });
  document.getElementById('inp-sub').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    render();
  });
  document.getElementById('inp-title').addEventListener('change', commit);
  document.getElementById('inp-sub').addEventListener('change', commit);

  document.getElementById('rng-grain').addEventListener('input', (e) => {
    state.grain = Number(e.target.value);
    document.getElementById('grain-val').textContent = state.grain + '%';
    render();
  });
  document.getElementById('rng-vignette').addEventListener('input', (e) => {
    state.vignette = Number(e.target.value);
    document.getElementById('vig-val').textContent = state.vignette + '%';
    render();
  });
  document.getElementById('rng-grain').addEventListener('change', commit);
  document.getElementById('rng-vignette').addEventListener('change', commit);

  document.getElementById('rng-zoom').addEventListener('input', (e) => {
    const p = state.panels[state.selected];
    if (!p) return;
    p.scale = Number(e.target.value) / 100;
    document.getElementById('zoom-val').textContent = e.target.value + '%';
    render();
  });
  document.getElementById('rng-rot').addEventListener('input', (e) => {
    const p = state.panels[state.selected];
    if (!p) return;
    p.rot = Number(e.target.value);
    document.getElementById('rot-val').textContent = p.rot + '°';
    render();
  });
  document.getElementById('rng-zoom').addEventListener('change', commit);
  document.getElementById('rng-rot').addEventListener('change', commit);

  document.getElementById('sel-photo').addEventListener('change', (e) => {
    const p = state.panels[state.selected];
    if (!p) return;
    commit();
    p.photo = Number(e.target.value);
    syncControls();
    render();
  });

  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-export-square').addEventListener('click', () => exportPNG(1080, 1080, 'vice-cover-square.png'));
  document.getElementById('btn-export-portrait').addEventListener('click', () => exportPNG(1080, 1350, 'vice-cover-portrait.png'));
  document.getElementById('btn-export-wide').addEventListener('click', () => exportPNG(1920, 1080, 'vice-cover-wide.png'));

  // Canvas drag = move selected panel's photo; wheel = zoom it.
  let drag = null;
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * PREVIEW_W,
      y: ((e.clientY - r.top) / r.height) * PREVIEW_H,
    };
  }
  canvas.addEventListener('pointerdown', (e) => {
    const pt = canvasPoint(e);
    const rects = layoutRects(state.layout, PREVIEW_W, PREVIEW_H);
    for (let i = rects.length - 1; i >= 0; i--) {
      const r = rects[i];
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
        state.selected = i;
        syncControls();
        break;
      }
    }
    const p = state.panels[state.selected];
    drag = { x: pt.x, y: pt.y, ox: p.ox, oy: p.oy };
    canvas.setPointerCapture(e.pointerId);
    render();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = canvasPoint(e);
    const p = state.panels[state.selected];
    p.ox = drag.ox + (pt.x - drag.x);
    p.oy = drag.oy + (pt.y - drag.y);
    render();
  });
  canvas.addEventListener('pointerup', () => {
    if (drag) { drag = null; commit(); }
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = state.panels[state.selected];
    if (!p) return;
    p.scale = Math.min(3, Math.max(0.5, p.scale * (e.deltaY < 0 ? 1.06 : 0.94)));
    syncControls();
    render();
  }, { passive: false });
}

/* ---- boot ---- */
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const shotSize = params.get('size') || 'wide';

async function boot() {
  bindEvents();
  ensurePanels();
  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const sizes = { square: [1080, 1080], portrait: [1080, 1350], wide: [1920, 1080] };
    const [W, H] = sizes[shotSize] || sizes.wide;
    state.layout = 'hero3';
    state.grade = 'vice';
    state.photos = SAMPLES.map((s) => ({ src: s.src, name: s.name }));
    state.panels.forEach((p, i) => { p.photo = i % state.photos.length; });
    try { await Promise.all([document.fonts.load('100px Anton'), document.fonts.load('40px Pacifico')]); } catch (e) { /* fall back to system fonts */ }
    await document.fonts.ready;
    await renderCover(canvas, W, H, state);
    document.title = 'Vice Cover — shot';
    return;
  }
  // Editor (plain or ?shot=editor): preload the sample photos.
  syncControls();
  updateUndoButtons();
  await loadSamples();
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  render();
}

boot();
