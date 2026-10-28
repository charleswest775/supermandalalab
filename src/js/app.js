// Super Mandala Lab: the in-browser maker.
import {
  R, SHAPES, SYMMETRY_CHOICES, TEMPLATES, buildPaths, designSVG, pathD, smoothStroke, normalizeDesign,
  emptyDesign, ringLayer, randomDesign, templateDesign, cutOutlines, cutSVG, toDXF, pdfContent, pdfFile,
  compactDesign, countPieces, boundsOf, newId,
} from './core.js';

const STORE_KEY = 'sml:design:v1';
const PREF_KEY = 'sml:prefs:v1';

function init(root) {
  const $ = sel => root.querySelector(sel);
  const $$ = sel => Array.from(root.querySelectorAll(sel));
  const svg = $('#mk-svg');
  const art = $('#mk-art');
  const hi = $('#mk-highlight');
  const live = $('#mk-live');
  const guides = $('#mk-guides');
  const layerList = $('#mk-layers');
  const toast = $('#mk-toast');

  let design = null;
  let mode = 'draw';
  let selected = null;
  const undo = [], redo = [];
  let prefs = loadPrefs();

  // ----- startup design -----
  const fromHash = readHashDesign();
  const tmpl = new URLSearchParams(location.search).get('template') || root.dataset.template;
  Promise.resolve(fromHash).then(shared => {
    if (shared) design = shared;
    else if (tmpl && templateDesign(tmpl)) design = templateDesign(tmpl);
    else design = loadStored() || templateDesign(root.dataset.default || 'lotus-mandala');
    if (shared) history.replaceState(null, '', location.pathname + location.search);
    syncControls();
    renderAll();
    root.classList.add('is-ready');
  });

  window.addEventListener('hashchange', async () => {
    const shared = await readHashDesign();
    if (!shared) return;
    commit();
    design = shared;
    selected = null;
    history.replaceState(null, '', location.pathname + location.search);
    syncControls();
    renderAll();
    root.scrollIntoView({ behavior: 'smooth' });
  });

  // ----- history -----
  function commit() {
    undo.push(JSON.stringify(design));
    if (undo.length > 120) undo.shift();
    redo.length = 0;
    updateHistoryButtons();
  }
  function stepHistory(from, to) {
    if (!from.length) return;
    to.push(JSON.stringify(design));
    design = JSON.parse(from.pop());
    if (selected && !design.layers.some(l => l.id === selected)) selected = null;
    syncControls();
    renderAll();
  }
  function updateHistoryButtons() {
    $('#mk-undo').disabled = !undo.length;
    $('#mk-redo').disabled = !redo.length;
  }

  // ----- rendering -----
  let saveTimer = 0;
  function renderArt() {
    const paths = buildPaths(design);
    art.setAttribute('stroke', design.ink);
    art.setAttribute('stroke-width', design.w);
    let s = '';
    for (const p of paths) {
      s += `<path d="${pathD(p.pts, p.closed)}"${p.fill ? ` fill="${p.fill}"` : ''}${p.w !== design.w ? ` stroke-width="${p.w}"` : ''}/>`;
    }
    art.innerHTML = s;
    $('#mk-bg').setAttribute('fill', design.bg === 'transparent' ? '#ffffff' : design.bg);
    renderHighlight(paths);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store(design), 300);
    $('#mk-empty').hidden = design.layers.length > 0;
  }
  function renderHighlight(paths) {
    if (!selected || mode !== 'shapes') { hi.innerHTML = ''; return; }
    paths = paths || buildPaths(design);
    let s = '';
    for (const p of paths) if (p.id === selected) s += `<path d="${pathD(p.pts, p.closed)}" stroke-width="${p.w + 4}"/>`;
    hi.innerHTML = s;
  }
  function renderGuides() {
    const on = prefs.guides !== false;
    guides.style.display = on ? '' : 'none';
    if (!on) return;
    let s = '';
    const n = design.n;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      s += `<line x1="0" y1="0" x2="${(R * Math.cos(a)).toFixed(1)}" y2="${(R * Math.sin(a)).toFixed(1)}"/>`;
      if (design.mirror) {
        const b = a + Math.PI / n;
        s += `<line class="half" x1="0" y1="0" x2="${(R * Math.cos(b)).toFixed(1)}" y2="${(R * Math.sin(b)).toFixed(1)}"/>`;
      }
    }
    s += `<circle r="${R}"/><circle r="${R / 2}" class="half"/>`;
    guides.innerHTML = s;
  }
  function renderAll() {
    renderGuides();
    renderArt();
    renderLayers();
    updateHistoryButtons();
  }

  // ----- drawing -----
  let drawing = null;
  function toLocal(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  }
  function livePath(pts) {
    const n = design.n;
    let s = '';
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      s += `<path d="${pathD(pts.map(([x, y]) => [x * c - y * sn, x * sn + y * c]), false)}"/>`;
      if (design.mirror) s += `<path d="${pathD(pts.map(([x, y]) => [x * c + y * sn, x * sn - y * c]), false)}"/>`;
    }
    return s;
  }
  svg.addEventListener('pointerdown', e => {
    if (mode !== 'draw' || e.button > 0) return;
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    drawing = { pts: [toLocal(e)], id: e.pointerId };
    live.setAttribute('stroke', design.ink);
    live.setAttribute('stroke-width', design.w);
  });
  svg.addEventListener('pointermove', e => {
    if (!drawing || e.pointerId !== drawing.id) return;
    const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evts) {
      const p = toLocal(ev);
      const last = drawing.pts[drawing.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.2) drawing.pts.push(p);
    }
    live.innerHTML = livePath(drawing.pts);
  });
  const endDraw = e => {
    if (!drawing || e.pointerId !== drawing.id) return;
    const pts = drawing.pts;
    drawing = null;
    live.innerHTML = '';
    if (pts.length < 2) {
      // A tap draws a small dot.
      const [x, y] = pts[0];
      pts.push([x + 0.5, y + 0.5]);
    }
    commit();
    design.layers.push({ id: newId(), kind: 'stroke', pts: smoothStroke(pts), w: null, fill: null });
    renderArt();
    renderLayers();
  };
  svg.addEventListener('pointerup', endDraw);
  svg.addEventListener('pointercancel', endDraw);

  // ----- mode -----
  function setMode(m) {
    mode = m;
    root.dataset.mode = m;
    $$('[data-mode-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.modeBtn === m)));
    if (m === 'shapes') showTab('shapes');
    renderHighlight();
  }
  $$('[data-mode-btn]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.modeBtn)));

  // ----- tabs -----
  function showTab(name) {
    $$('[data-tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  }
  $$('[data-tab]').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ----- design controls -----
  const nSel = $('#mk-n');
  nSel.innerHTML = SYMMETRY_CHOICES.map(n => `<option value="${n}">${n} slices</option>`).join('');
  const tSel = $('#mk-template');
  tSel.innerHTML = '<option value="">Choose a template…</option>' + TEMPLATES.map(t => `<option value="${t.slug}">${t.name}</option>`).join('');

  function syncControls() {
    if (!SYMMETRY_CHOICES.includes(design.n)) {
      nSel.insertAdjacentHTML('beforeend', `<option value="${design.n}">${design.n} slices</option>`);
    }
    nSel.value = String(design.n);
    $('#mk-mirror').checked = design.mirror;
    $('#mk-w').value = String(design.w);
    $('#mk-w-out').textContent = (+design.w).toFixed(1);
    $('#mk-ink').value = design.ink;
    $('#mk-bgc').value = design.bg === 'transparent' ? '#ffffff' : design.bg;
    $('#mk-guides-on').checked = prefs.guides !== false;
  }
  nSel.addEventListener('change', () => { commit(); design.n = +nSel.value; renderAll(); });
  $('#mk-mirror').addEventListener('change', e => { commit(); design.mirror = e.target.checked; renderAll(); });
  let wCommitted = false;
  $('#mk-w').addEventListener('input', e => {
    if (!wCommitted) { commit(); wCommitted = true; }
    design.w = +e.target.value;
    $('#mk-w-out').textContent = design.w.toFixed(1);
    renderArt();
  });
  $('#mk-w').addEventListener('change', () => { wCommitted = false; });
  $('#mk-ink').addEventListener('change', e => { commit(); design.ink = e.target.value; renderArt(); });
  $('#mk-ink').addEventListener('input', e => { design.ink = e.target.value; renderArt(); });
  $('#mk-bgc').addEventListener('change', e => { commit(); design.bg = e.target.value; renderArt(); });
  $('#mk-bgc').addEventListener('input', e => { design.bg = e.target.value; renderArt(); });
  $('#mk-guides-on').addEventListener('change', e => { prefs.guides = e.target.checked; savePrefs(prefs); renderGuides(); });
  tSel.addEventListener('change', () => {
    if (!tSel.value) return;
    commit();
    design = templateDesign(tSel.value);
    selected = null;
    tSel.value = '';
    syncControls();
    renderAll();
    say('Template loaded. Undo brings back your last design.');
  });
  $('#mk-random').addEventListener('click', () => {
    commit();
    const lvl = $('#mk-level').value;
    design = randomDesign(Math.floor(Math.random() * 1e9), lvl);
    selected = null;
    syncControls();
    renderAll();
  });
  $('#mk-clear').addEventListener('click', () => {
    if (!design.layers.length) return;
    commit();
    design.layers = [];
    selected = null;
    renderAll();
    say('Cleared. Undo brings it back.');
  });
  $('#mk-undo').addEventListener('click', () => stepHistory(undo, redo));
  $('#mk-redo').addEventListener('click', () => stepHistory(redo, undo));
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
    if (/input|select|textarea/i.test(document.activeElement?.tagName || '') && document.activeElement.type !== 'range') return;
    e.preventDefault();
    if (e.shiftKey) stepHistory(redo, undo); else stepHistory(undo, redo);
  });

  // ----- shapes / layers -----
  const addSel = $('#mk-add-shape');
  addSel.innerHTML = Object.entries(SHAPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('#mk-add').addEventListener('click', () => {
    commit();
    const shape = addSel.value;
    let ext = 0;
    for (const p of buildPaths(design)) for (const [x, y] of p.pts) ext = Math.max(ext, Math.hypot(x, y));
    const r = Math.min(R - 60, ext > 0 ? ext + 6 : 0);
    const circ = (2 * Math.PI * (r + 30)) / design.n;
    const l = ringLayer(shape, Math.round(r), 60, Math.round(Math.max(10, Math.min(80, circ * 0.7))));
    if (SHAPES[shape].kind === 'ring') l.len = shape === 'circle' ? 0 : 24;
    if (shape === 'dot') { l.len = 24; l.wid = 24; }
    design.layers.push(l);
    selected = l.id;
    setMode('shapes');
    renderArt();
    renderLayers();
    const card = layerList.querySelector(`[data-id="${l.id}"]`);
    if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const SLIDERS = [
    ['r', 'Distance from center', 0, R, 1],
    ['len', 'Length', 1, 400, 1],
    ['wid', 'Width', 1, 400, 1],
    ['mult', 'Repeats per slice', 1, 4, 1],
    ['spin', 'Twist', -90, 90, 1],
    ['echo', 'Inner outlines', 0, 3, 1],
  ];
  function slidersFor(l) {
    const kind = SHAPES[l.shape]?.kind;
    return SLIDERS.filter(([k]) => {
      if (kind === 'ring') return ['r', 'len', 'mult'].includes(k) && !(l.shape === 'circle' && k !== 'r');
      if (l.shape === 'line') return !['wid', 'echo'].includes(k);
      return true;
    });
  }
  function renderLayers() {
    const items = design.layers.map((l, i) => {
      const isSel = l.id === selected;
      const title = l.kind === 'stroke' ? 'Freehand line' : SHAPES[l.shape].label;
      let body = '';
      if (isSel) {
        if (l.kind === 'ring') {
          body += `<label class="mk-row"><span>Shape</span><select data-k="shape">${Object.entries(SHAPES).map(([k, v]) => `<option value="${k}"${k === l.shape ? ' selected' : ''}>${v.label}</option>`).join('')}</select></label>`;
          for (const [k, label, lo, hi, step] of slidersFor(l)) {
            const v = l[k] ?? 0;
            body += `<label class="mk-row"><span>${label}</span><input type="range" data-k="${k}" min="${lo}" max="${hi}" step="${step}" value="${v}"><output>${k === 'mult' ? '×' + v : k === 'spin' ? v + '°' : Math.round(v)}</output></label>`;
          }
          body += `<label class="mk-check"><input type="checkbox" data-k="off"${l.off ? ' checked' : ''}> Shift half a step</label>`;
          if (l.shape !== 'line') {
            body += `<div class="mk-row"><span>Fill</span><label class="mk-check"><input type="checkbox" data-k="fillOn"${l.fill ? ' checked' : ''}> Fill</label><input type="color" data-k="fill" value="${l.fill || '#f2b134'}" aria-label="Fill color"></div>`;
          }
        }
        const lw = l.w ?? design.w;
        body += `<label class="mk-row"><span>Line weight</span><input type="range" data-k="w" min="0.5" max="20" step="0.5" value="${lw}"><output>${(+lw).toFixed(1)}</output></label>`;
        body += `<div class="mk-layer-actions">
          <button type="button" data-act="up" ${i === design.layers.length - 1 ? 'disabled' : ''}>Bring forward</button>
          <button type="button" data-act="down" ${i === 0 ? 'disabled' : ''}>Send back</button>
          <button type="button" data-act="dup">Duplicate</button>
          <button type="button" data-act="del" class="danger">Delete</button></div>`;
      }
      return `<li class="mk-layer${isSel ? ' is-sel' : ''}" data-id="${l.id}">
        <button type="button" class="mk-layer-head" data-act="select" aria-expanded="${isSel}">
          <span class="mk-swatch" aria-hidden="true">${miniIcon(l)}</span><span>${title}</span><span class="mk-num">${i + 1}</span></button>
        ${isSel ? `<div class="mk-layer-body">${body}</div>` : ''}</li>`;
    }).reverse();
    layerList.innerHTML = items.join('') || '<li class="mk-hint">No layers yet. Add a shape above, or switch to Draw and sketch in any slice.</li>';
    $('#mk-layer-count').textContent = String(design.layers.length);
  }
  function miniIcon(l) {
    if (l.kind === 'stroke') return '<svg viewBox="0 0 20 20"><path d="M3 15c3-8 6 2 9-6s4 2 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    const d = { petal: 'M10 18C4 12 6 5 10 2c4 3 6 10 0 16z', leaf: 'M10 2c5 5 5 11 0 16-5-5-5-11 0-16z', drop: 'M10 2c5 8 5 12 0 16-5-4-5-8 0-16z',
      dot: 'M10 5a5 5 0 1 1 0 10a5 5 0 1 1 0-10z', diamond: 'M10 2l6 8-6 8-6-8z', spike: 'M4 18L10 2l6 16z', arch: 'M3 18a7 9 0 0 1 14 0z',
      heart: 'M10 17C2 11 4 4 10 7c6-3 8 4 0 10z', square: 'M4 4h12v12H4z', line: 'M10 2v16', circle: 'M10 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14z',
      scallop: 'M3 12q2-6 4 0q2-6 4 0q2-6 4 0q1-4 2 0', zigzag: 'M2 13l3-6 3 6 3-6 3 6 3-6', wave: 'M2 10q2-5 4 0t4 0 4 0 4 0' }[l.shape] || '';
    return `<svg viewBox="0 0 20 20"><path d="${d}" fill="${l.fill || 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  let sliderCommitted = false;
  layerList.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const li = btn.closest('[data-id]');
    const id = li?.dataset.id;
    const idx = design.layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const act = btn.dataset.act;
    if (act === 'select') {
      selected = selected === id ? null : id;
      if (mode !== 'shapes' && selected) setMode('shapes');
      renderLayers(); renderHighlight();
      return;
    }
    commit();
    if (act === 'del') { design.layers.splice(idx, 1); selected = null; }
    if (act === 'dup') {
      const c = { ...JSON.parse(JSON.stringify(design.layers[idx])), id: newId() };
      if (c.kind === 'ring') c.off = c.off ? 0 : 0.5;
      design.layers.splice(idx + 1, 0, c); selected = c.id;
    }
    if (act === 'up' && idx < design.layers.length - 1) [design.layers[idx], design.layers[idx + 1]] = [design.layers[idx + 1], design.layers[idx]];
    if (act === 'down' && idx > 0) [design.layers[idx], design.layers[idx - 1]] = [design.layers[idx - 1], design.layers[idx]];
    renderArt(); renderLayers();
  });
  layerList.addEventListener('input', e => {
    const el = e.target;
    const k = el.dataset.k;
    const l = design.layers.find(x => x.id === el.closest('[data-id]')?.dataset.id);
    if (!k || !l) return;
    if (el.type === 'range') {
      if (!sliderCommitted) { commit(); sliderCommitted = true; }
      const v = +el.value;
      if (k === 'w') l.w = v; else l[k] = v;
      const out = el.parentElement.querySelector('output');
      if (out) out.textContent = k === 'mult' ? '×' + v : k === 'spin' ? v + '°' : k === 'w' ? v.toFixed(1) : String(Math.round(v));
      renderArt();
    } else if (k === 'fill' && l.fill) {
      l.fill = el.value; renderArt();
    }
  });
  layerList.addEventListener('change', e => {
    const el = e.target;
    const k = el.dataset.k;
    const l = design.layers.find(x => x.id === el.closest('[data-id]')?.dataset.id);
    if (!k || !l) return;
    if (el.type === 'range') { sliderCommitted = false; return; }
    commit();
    if (k === 'shape') {
      l.shape = el.value;
      if (SHAPES[l.shape].kind === 'ring' && l.shape !== 'circle' && l.len > 80) l.len = 30;
      renderArt(); renderLayers(); return;
    }
    if (k === 'off') l.off = el.checked ? 0.5 : 0;
    if (k === 'fillOn') l.fill = el.checked ? (el.parentElement.parentElement.querySelector('input[type=color]')?.value || '#f2b134') : null;
    if (k === 'fill') l.fill = el.value;
    renderArt();
  });

  // ----- downloads -----
  const fileBase = 'mandala-supermandalalab';
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    track(name.split('.').pop());
  }
  let clipperPromise = null;
  function clipper() {
    if (window.ClipperLib) return Promise.resolve(window.ClipperLib);
    clipperPromise ||= new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = root.dataset.clipper || '/js/clipper.js';
      s.onload = () => res(window.ClipperLib);
      s.onerror = () => { clipperPromise = null; rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return clipperPromise;
  }
  const busy = async (btn, fn) => {
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Preparing…';
    try { await fn(); } catch (err) { console.error(err); say('Sorry, that download failed. Try again, or try a simpler design.'); }
    finally { btn.disabled = false; btn.textContent = label; }
  };
  const hasArt = () => {
    if (design.layers.length) return true;
    say('Draw something or pick a template first.');
    return false;
  };

  $('#mk-dl-png').addEventListener('click', e => hasArt() && busy(e.currentTarget, async () => {
    const px = +$('#mk-png-size').value;
    const transparent = $('#mk-png-clear').checked;
    const d = transparent ? { ...design, bg: 'transparent' } : design;
    const s = designSVG(d, { width: px, height: px });
    const img = new Image();
    const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = c.height = px;
    c.getContext('2d').drawImage(img, 0, 0, px, px);
    URL.revokeObjectURL(url);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    download(blob, fileBase + '.png');
  }));

  $('#mk-dl-pdf').addEventListener('click', e => hasArt() && busy(e.currentTarget, async () => {
    const page = pdfContent(design, { page: $('#mk-pdf-page').value, coloring: $('#mk-pdf-coloring').checked });
    let compressed = null;
    if (window.CompressionStream) {
      const stream = new Blob([page.content]).stream().pipeThrough(new CompressionStream('deflate'));
      compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    download(new Blob([pdfFile(page, compressed)], { type: 'application/pdf' }), fileBase + '.pdf');
  }));

  function cutOptions(prefix) {
    const unit = $(`#${prefix}-unit`).value;
    const size = Math.max(0.5, +$(`#${prefix}-size`).value || (unit === 'mm' ? 300 : 12));
    const thick = Math.max(0.001, +$(`#${prefix}-thick`).value || (unit === 'mm' ? 2 : 0.08));
    return { unit, size, thick, style: $(`#${prefix}-style`).value };
  }
  // Line thickness is given in real units, so convert it to design units for the given finished size.
  function weightFor(o) {
    const b = boundsOf(buildPaths(design).map(p => ({ ...p, w: 0 })));
    const span = Math.max(b.x1 - b.x0, b.y1 - b.y0) || R * 2;
    // The finished size includes the line thickness on both edges.
    return (o.thick * span) / Math.max(0.0001, o.size - o.thick);
  }
  async function cutPolys(o) {
    const C = await clipper();
    const weight = weightFor(o);
    return cutOutlines(buildPaths(design), C, { weight, stencil: o.style === 'stencil', margin: weight * 4 });
  }
  function piecesNote(polys, o) {
    const n = countPieces(polys);
    if (o.style === 'stencil') {
      return n > 1 ? `Heads up: ${n - 1} enclosed area${n - 1 === 1 ? '' : 's'} will fall out of this stencil. Add bridges in your cutting software, or use Cut-ready shapes instead.` : 'This stencil cuts as one piece.';
    }
    return n > 1 ? `Heads up: this design cuts as ${n} separate pieces. Shapes that don't touch another line come out loose. Overlap them, or add a ring to tie them together.` : 'Nice: this design cuts as one connected piece.';
  }
  $('#mk-dl-svg').addEventListener('click', e => hasArt() && busy(e.currentTarget, async () => {
    const o = cutOptions('mk-svg');
    if (o.style === 'lines') {
      download(new Blob([designSVG(design, { width: o.size + o.unit })], { type: 'image/svg+xml' }), fileBase + '.svg');
      return;
    }
    const polys = await cutPolys(o);
    download(new Blob([cutSVG(polys, { physW: o.size, unit: o.unit })], { type: 'image/svg+xml' }), fileBase + '-cut.svg');
    say(piecesNote(polys, o), 9000);
  }));
  $('#mk-dl-dxf').addEventListener('click', e => hasArt() && busy(e.currentTarget, async () => {
    const o = cutOptions('mk-dxf');
    let dxf, polys = null;
    if (o.style === 'lines') {
      dxf = toDXF(buildPaths(design), { unit: o.unit, size: o.size });
    } else {
      polys = await cutPolys(o);
      dxf = toDXF(polys, { unit: o.unit, size: o.size });
    }
    download(new Blob([dxf], { type: 'application/dxf' }), fileBase + (o.style === 'lines' ? '-lines' : '-cut') + '.dxf');
    if (polys) say(piecesNote(polys, o), 9000);
  }));
  ['mk-svg', 'mk-dxf'].forEach(prefix => {
    const unitSel = $(`#${prefix}-unit`);
    unitSel.addEventListener('change', () => {
      const mm = unitSel.value === 'mm';
      $(`#${prefix}-size`).value = mm ? 300 : 12;
      $(`#${prefix}-thick`).value = mm ? 2 : 0.08;
    });
    const styleSel = $(`#${prefix}-style`);
    const sync = () => root.querySelectorAll(`[data-cut-for="${prefix}"]`).forEach(el => { el.hidden = styleSel.value === 'lines' && el.dataset.cutOnly === '1'; });
    styleSel.addEventListener('change', sync); sync();
  });

  $('#mk-share').addEventListener('click', async e => {
    if (!hasArt()) return;
    const url = await shareURL(design);
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied. Anyone with it can open and edit a copy of this mandala.');
    } catch {
      prompt('Copy this link:', url);
    }
    track('share');
  });

  if (root.dataset.focusTab) showTab(root.dataset.focusTab);
  setMode('draw');

  // ----- small helpers -----
  let toastTimer = 0;
  function say(msg, ms = 4000) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms);
  }
}

function track(what) {
  try { window.dispatchEvent(new CustomEvent('sml:download', { detail: what })); } catch {}
}

function store(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(compactDesign(d))); } catch {}
}
function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const d = normalizeDesign(JSON.parse(raw));
    return d.layers.length ? d : null;
  } catch { return null; }
}
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
}

const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function shareURL(d) {
  const json = JSON.stringify(compactDesign(d));
  let payload;
  if (window.CompressionStream) {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    payload = 'z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } else {
    payload = 'j' + b64u(new TextEncoder().encode(json));
  }
  return `${location.origin}/#d=${payload}`;
}

async function readHashDesign() {
  const m = location.hash.match(/^#d=([zj])([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const bytes = unb64u(m[2]);
    let json;
    if (m[1] === 'z') {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      json = await new Response(stream).text();
    } else {
      json = new TextDecoder().decode(bytes);
    }
    const d = normalizeDesign(JSON.parse(json));
    return d.layers.length ? d : null;
  } catch { return null; }
}

// Start last, so every helper above is initialized first.
const makerRoot = document.getElementById('maker');
if (makerRoot) init(makerRoot);

export { emptyDesign };
