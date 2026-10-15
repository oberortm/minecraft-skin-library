import { t, applyI18n } from "./i18n.js";
import { renderFigure, figureToTexture, faceAt, faceList, legacyTo64, blankTemplate, loadImage, mirrorPixel } from "./skin.js";
import { drawRegions } from "./app.js";
import { $ } from "./dom.js";
import { load3d } from "./view3d.js";
import { Paint3D } from "./paint3d.js";

const S = 10; // texture canvas scale (64 px -> 640 px)
const RECENT_KEY = "skin-library-recent-colors";
const MODE_KEY = "skin-library-editor-mode";
const NOISE_KEY = "skin-library-noise";
const STROKE_TOOLS = new Set(["pencil", "eraser", "noise"]);

const ed = {
  open: false, skin: null, onSave: null,
  tex: null, ctx: null,
  model: "classic", layer: "base", tool: "pencil", color: "#3b6fe0",
  show: { base: true, outer: true }, mirror: false, noise: 0.25, mode: "3d", space: false,
  undo: [], redo: [], dirty: false,
  stroke: null, hover: null, hover3d: null, p3d: null, p3dFailed: false, frame: 0,
};

export const editorOpen = () => ed.open;
/** Read-only look at the editor state, for automated tests. */
export const editorDebug = () => ed;

// ---------- drawing primitives ----------
const aw = () => (ed.model === "slim" ? 3 : 4);
function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
function getPx(x, y) { return ed.ctx.getImageData(x, y, 1, 1).data; }
function setPx(x, y, rgba) {
  if (x < 0 || y < 0 || x > 63 || y > 63) return;
  if (rgba[3] === 0) ed.ctx.clearRect(x, y, 1, 1);
  else { ed.ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] / 255})`; ed.ctx.clearRect(x, y, 1, 1); ed.ctx.fillRect(x, y, 1, 1); }
}
/** The colour, randomly lighter or darker; strength 0..1 (1 = up to half way to white/black). */
function noisy(rgba) {
  const d = (Math.random() * 2 - 1) * ed.noise * 0.5;
  return rgba.map((c, i) => (i === 3 ? c : Math.round(d > 0 ? c + (255 - c) * d : c * (1 + d))));
}
function line(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function flood(x, y, rgba) {
  const face = faceAt(aw(), x, y);
  if (!face) return;
  const [fx, fy, fw, fh] = face.rect;
  const img = ed.ctx.getImageData(fx, fy, fw, fh);
  const d = img.data;
  const idx = (px, py) => ((py - fy) * fw + (px - fx)) * 4;
  const start = d.slice(idx(x, y), idx(x, y) + 4);
  const same = i => d[i] === start[0] && d[i + 1] === start[1] && d[i + 2] === start[2] && d[i + 3] === start[3];
  if (start[0] === rgba[0] && start[1] === rgba[1] && start[2] === rgba[2] && start[3] === rgba[3]) return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop();
    if (px < fx || py < fy || px >= fx + fw || py >= fy + fh) continue;
    const i = idx(px, py);
    if (!same(i)) continue;
    d[i] = rgba[0]; d[i + 1] = rgba[1]; d[i + 2] = rgba[2]; d[i + 3] = rgba[3];
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  ed.ctx.putImageData(img, fx, fy);
}

function snapshot() {
  ed.undo.push(ed.ctx.getImageData(0, 0, 64, 64));
  if (ed.undo.length > 200) ed.undo.shift();
  ed.redo = [];
  syncHistory();
}
function syncHistory() {
  $("eUndo").disabled = !ed.undo.length;
  $("eRedo").disabled = !ed.redo.length;
}
function undo() {
  if (!ed.undo.length) return;
  ed.redo.push(ed.ctx.getImageData(0, 0, 64, 64));
  ed.ctx.putImageData(ed.undo.pop(), 0, 0);
  ed.dirty = true; syncHistory(); redraw();
}
function redoFn() {
  if (!ed.redo.length) return;
  ed.undo.push(ed.ctx.getImageData(0, 0, 64, 64));
  ed.ctx.putImageData(ed.redo.pop(), 0, 0);
  ed.dirty = true; syncHistory(); redraw();
}

// ---------- applying tools ----------
/** Apply the current tool at one texture pixel (and its mirror twin). Returns true if the texture changed. */
function applyAt(x, y, first) {
  const tool = ed.tool;
  if (tool === "rotate") return false;
  if (tool === "picker") {
    const p = getPx(x, y);
    if (p[3] > 0) setColor("#" + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, "0")).join(""));
    setTool("pencil");
    return false;
  }
  if (first) snapshot();
  const paint = (px, py) => {
    if (tool === "fill") flood(px, py, hexToRgba(ed.color));
    else if (tool === "noise") setPx(px, py, noisy(hexToRgba(ed.color)));
    else setPx(px, py, tool === "eraser" ? [0, 0, 0, 0] : hexToRgba(ed.color));
  };
  paint(x, y);
  if (ed.mirror) {
    const m = mirrorPixel(aw(), x, y);
    if (m && (m[0] !== x || m[1] !== y)) paint(m[0], m[1]);
  }
  return true;
}

// ---------- rendering ----------
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawTexCanvas() {
  const c = $("eTex"), ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 640, 640);
  ctx.drawImage(ed.tex, 0, 0, 640, 640);
  const faces = faceList(aw());
  // dim everything that is not on the selected layer
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 640, 640);
  for (const f of faces) if (f.layer === ed.layer) { const [x, y, w, h] = f.rect; ctx.rect(x * S, y * S, w * S, h * S); }
  ctx.fillStyle = css("--surface");
  ctx.globalAlpha = 0.6;
  ctx.fill("evenodd");
  ctx.restore();
  if ($("eGrid").checked) {
    ctx.strokeStyle = css("--fg"); ctx.globalAlpha = 0.08; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 64; i++) { ctx.moveTo(i * S + 0.5, 0); ctx.lineTo(i * S + 0.5, 640); ctx.moveTo(0, i * S + 0.5); ctx.lineTo(640, i * S + 0.5); }
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    for (const f of faces) if (f.layer === ed.layer) { const [x, y, w, h] = f.rect; ctx.strokeRect(x * S + 0.5, y * S + 0.5, w * S - 1, h * S - 1); }
    ctx.globalAlpha = 1;
  }
  if ($("eRegions").checked) drawRegions(ctx, S, 64);
  if (ed.hover) {
    ctx.strokeStyle = css("--accent"); ctx.lineWidth = 2;
    ctx.strokeRect(ed.hover[0] * S + 1, ed.hover[1] * S + 1, S - 2, S - 2);
  }
}

/** Small texture next to the 3D figure, with the pixel under the pointer framed. */
function drawMini() {
  const c = $("eTexMini"), ctx = c.getContext("2d"), M = 4;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 256, 256);
  ctx.drawImage(ed.tex, 0, 0, 256, 256);
  const h = ed.hover3d;
  if (h) {
    ctx.strokeStyle = h.blocked ? css("--danger") : css("--accent"); ctx.lineWidth = 2;
    ctx.strokeRect(h.x * M - 1, h.y * M - 1, M + 2, M + 2);
  }
}

function drawFigures() {
  const opts = { outer: ed.show.outer, dimLayer: ed.layer === "base" ? "outer" : null };
  renderFigure($("eFront"), ed.tex, ed.model, "front", opts);
  renderFigure($("eBack"), ed.tex, ed.model, "back", opts);
}

/** Push the texture to the 3D figure, at most once per frame. */
function update3d() {
  if (!ed.p3d || ed.frame) return;
  ed.frame = requestAnimationFrame(() => {
    ed.frame = 0;
    if (!ed.p3d) return;
    ed.p3d.draw(ed.tex, ed.mode === "3d" ? ed.hover3d : null);
  });
}

function redraw() {
  if (ed.mode === "tex") { drawTexCanvas(); drawFigures(); }
  else drawMini();
  update3d();
}

// ---------- pointer handling: texture view and flat figures ----------
function texPoint(e) {
  const r = $("eTex").getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * 64), y = Math.floor((e.clientY - r.top) / r.height * 64);
  return x >= 0 && y >= 0 && x < 64 && y < 64 ? [x, y] : null;
}
function figurePoint(canvas, side, e) {
  const r = canvas.getBoundingClientRect();
  const vx = Math.floor((e.clientX - r.left) / r.width * 16), vy = Math.floor((e.clientY - r.top) / r.height * 32);
  return figureToTexture(ed.model, side, ed.layer, vx, vy);
}

function bindPaint(canvas, toTex) {
  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0 || ed.tool === "rotate") return;
    const p = toTex(e);
    if (!p) return;
    canvas.setPointerCapture(e.pointerId);
    const changed = applyAt(p[0], p[1], true);
    ed.stroke = changed && STROKE_TOOLS.has(ed.tool) ? { last: p, canvas } : null;
    if (changed) { ed.dirty = true; redraw(); }
  });
  canvas.addEventListener("pointermove", e => {
    if (canvas === $("eTex")) { ed.hover = texPoint(e); }
    if (ed.stroke && ed.stroke.canvas === canvas) {
      const p = toTex(e);
      if (p && (p[0] !== ed.stroke.last[0] || p[1] !== ed.stroke.last[1])) {
        // on the texture we can interpolate; on the figure faces may jump, so paint single pixels
        if (canvas === $("eTex")) line(ed.stroke.last[0], ed.stroke.last[1], p[0], p[1], (x, y) => applyAt(x, y, false));
        else applyAt(p[0], p[1], false);
        ed.stroke.last = p;
        redraw();
        return;
      }
    }
    if (canvas === $("eTex")) drawTexCanvas();
  });
  const end = () => { if (ed.stroke) pushRecent(ed.color); ed.stroke = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => { if (canvas === $("eTex")) { ed.hover = null; drawTexCanvas(); } });
}

// ---------- pointer handling: painting on the 3D figure ----------
const rotating = () => ed.tool === "rotate" || ed.space;
const alphaAt = (x, y) => getPx(x, y)[3];

function pick3d(e) {
  return ed.p3d ? ed.p3d.pick(e.clientX, e.clientY, ed.layer, alphaAt) : null;
}

function setHover3d(h) {
  const a = ed.hover3d;
  if (a === h || (a && h && a.x === h.x && a.y === h.y && !!a.blocked === !!h.blocked)) return;
  ed.hover3d = h;
  $("eHint3d").textContent = h && h.blocked ? t("outerBlocks") : hint3d();
  $("eHint3d").classList.toggle("warn", !!(h && h.blocked));
  drawMini(); update3d();
}

function bindPaint3d(canvas) {
  const touches = new Set();
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "touch") touches.add(e.pointerId);
    // a second finger means rotate/zoom: drop a stroke that has only just started
    if (touches.size > 1) { cancelFreshStroke(); return; }
    if (e.button !== 0 || rotating() || ed.mode !== "3d") return;
    const h = pick3d(e);
    setHover3d(h);
    if (!h || h.blocked) return;
    const changed = applyAt(h.x, h.y, true);
    ed.stroke = changed && STROKE_TOOLS.has(ed.tool)
      ? { canvas, sx: e.clientX, sy: e.clientY, last: [h.x, h.y], t: performance.now(), id: e.pointerId } : null;
    if (changed) { ed.dirty = true; redraw(); }
  });
  canvas.addEventListener("pointermove", e => {
    if (ed.mode !== "3d") return;
    const s = ed.stroke;
    if (s && s.canvas === canvas && s.id === e.pointerId) {
      // close gaps between pointer events: walk the screen path in small steps and paint every pixel it crosses
      const dx = e.clientX - s.sx, dy = e.clientY - s.sy;
      const steps = Math.min(200, Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2)));
      let changed = false, last = null;
      for (let i = 1; i <= steps; i++) {
        const h = ed.p3d.pick(s.sx + dx * i / steps, s.sy + dy * i / steps, ed.layer, alphaAt);
        if (!h || h.blocked) continue;
        last = h;
        if (h.x === s.last[0] && h.y === s.last[1]) continue;
        applyAt(h.x, h.y, false);
        s.last = [h.x, h.y]; changed = true;
      }
      s.sx = e.clientX; s.sy = e.clientY;
      setHover3d(last);
      if (changed) redraw();
      return;
    }
    if (rotating() || e.buttons) { setHover3d(null); return; }
    setHover3d(pick3d(e));
  });
  const end = e => {
    touches.delete(e.pointerId);
    if (ed.stroke && ed.stroke.canvas === canvas) { pushRecent(ed.color); ed.stroke = null; }
    if (e.pointerType === "touch") setHover3d(null);
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", e => { if (e.pointerType !== "touch") setHover3d(null); });
}

function cancelFreshStroke() {
  const s = ed.stroke;
  ed.stroke = null;
  if (!s || s.canvas !== ed.p3d?.canvas || performance.now() - s.t > 350 || !ed.undo.length) return;
  ed.ctx.putImageData(ed.undo.pop(), 0, 0);
  syncHistory(); redraw();
}

function hint3d() {
  if (ed.p3dFailed) return "";
  return matchMedia("(pointer: coarse)").matches ? t("paint3dHintTouch") : t("paint3dHint");
}

// ---------- color & tools ----------
function setColor(hex) {
  ed.color = hex.toLowerCase();
  $("eColor").value = ed.color;
  $("eHex").value = ed.color;
}
function setTool(tool) {
  ed.tool = tool;
  $("eNoiseOpt").hidden = tool !== "noise";
  document.querySelectorAll("#eTools .tool").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
  syncRotate();
}
function syncRotate() {
  if (ed.p3d && ed.mode === "3d") ed.p3d.setRotating(rotating());
  $("ePaint3d").classList.toggle("rotating", rotating());
  if (rotating()) setHover3d(null);
}
function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (e) { return []; } }
function pushRecent(hex) {
  if (ed.tool === "eraser") return;
  const list = [hex, ...recent().filter(c => c !== hex)].slice(0, 16);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  renderRecent(list);
}
function renderRecent(list = recent()) {
  $("eRecent").replaceChildren(...list.map(c => {
    const b = document.createElement("button");
    b.style.background = c; b.title = c; b.setAttribute("aria-label", c);
    b.addEventListener("click", () => { setColor(c); if (ed.tool === "eraser" || ed.tool === "picker" || ed.tool === "rotate") setTool("pencil"); });
    return b;
  }));
}

function syncSeg(id, v) { $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v))); }

// ---------- layers ----------
function setLayer(layer) {
  ed.layer = layer;
  // you can only paint on what you see
  if (!ed.show[layer]) { ed.show[layer] = true; syncShow(); }
  syncSeg("eLayer", layer);
  setHover3d(null);
  redraw();
}
function setShow(layer, on) {
  ed.show[layer] = on;
  const other = layer === "base" ? "outer" : "base";
  if (!on && ed.layer === layer && ed.show[other]) { ed.layer = other; syncSeg("eLayer", other); }
  syncShow();
  setHover3d(null);
  redraw();
}
function syncShow() {
  $("eShowBase").checked = ed.show.base;
  $("eShowOuter").checked = ed.show.outer;
  if (ed.p3d) ed.p3d.setLayers(ed.show.base, ed.show.outer);
}

// ---------- 3D | texture ----------
async function ensure3d() {
  if (ed.p3d || ed.p3dFailed) return ed.p3d;
  const kit = await load3d();
  if (ed.p3d) return ed.p3d;
  try {
    if (!kit) throw new Error("3D engine unavailable");
    ed.p3d = new Paint3D(kit);
    bindPaint3d(ed.p3d.canvas);
  } catch (e) {
    console.error("[skin-library] editor 3D failed:", e);
    ed.p3d = null; ed.p3dFailed = true;
  }
  return ed.p3d;
}

async function setMode(mode) {
  const p3d = await ensure3d();
  if (!p3d) mode = "tex";
  ed.mode = mode;
  ed.hover = null; ed.hover3d = null; ed.stroke = null;
  $("editor").dataset.mode = mode;
  $("eCanvas").dataset.mode = mode;
  syncSeg("eMode", mode);
  $("emode-3d").disabled = ed.p3dFailed;
  $("ePaintFallback").hidden = !ed.p3dFailed;
  $("eHint3d").textContent = mode === "3d" ? hint3d() : "";
  $("eHint3d").classList.remove("warn");
  try { localStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }
  if (p3d) {
    p3d.attach(mode === "3d" ? $("ePaint3d") : $("eView3d"));
    p3d.setMode(mode === "3d" ? "paint" : "preview");
    p3d.setModel(ed.model);
    syncShow();
    p3d.viewer.renderPaused = !ed.open;
    syncRotate();
  }
  redraw();
}

// ---------- open / close ----------
export async function openEditor(skin, onSave) {
  ed.skin = skin; ed.onSave = onSave;
  ed.tex = document.createElement("canvas"); ed.tex.width = 64; ed.tex.height = 64;
  ed.ctx = ed.tex.getContext("2d", { willReadFrequently: true });
  ed.ctx.imageSmoothingEnabled = false;
  ed.undo = []; ed.redo = []; ed.dirty = false; ed.hover = null; ed.hover3d = null; ed.stroke = null;
  ed.model = skin ? skin.model : "classic";
  if (skin) {
    const img = await loadImage(skin.data);
    ed.ctx.drawImage(img.height === 32 ? legacyTo64(img) : img, 0, 0);
  } else {
    ed.ctx.drawImage(blankTemplate(ed.model), 0, 0);
  }
  $("eName").value = skin ? skin.name : t("untitled");
  $("eSaveCopy").hidden = !skin;
  $("eDiscard").hidden = true;
  syncSeg("eModel", ed.model);
  syncSeg("eLayer", ed.layer);
  syncShow();
  setTool("pencil");
  setColor(ed.color);
  renderRecent();
  syncHistory();
  applyI18n($("editor"));
  $("editor").showModal();
  ed.open = true;
  let mode = "3d";
  try { if (localStorage.getItem(MODE_KEY) === "tex") mode = "tex"; } catch (e) { /* ignore */ }
  await setMode(mode);
}

function close() {
  ed.open = false; ed.stroke = null; ed.space = false;
  if (ed.p3d) ed.p3d.viewer.renderPaused = true;
  $("editor").close();
}
function requestClose() {
  if (ed.dirty) { $("eDiscard").hidden = false; $("eDiscardNo").focus(); return; }
  close();
}

async function save(asCopy) {
  const name = $("eName").value.trim() || t("untitled");
  const result = await ed.onSave({ data: ed.tex.toDataURL("image/png"), model: ed.model, name, asCopy });
  if (!result) return;
  ed.dirty = false;
  close();
}

// ---------- wiring (once, called from boot) ----------
export function setupEditor() {
  bindPaint($("eTex"), texPoint);
  bindPaint($("eFront"), e => figurePoint($("eFront"), "front", e));
  bindPaint($("eBack"), e => figurePoint($("eBack"), "back", e));
  $("eTools").addEventListener("click", e => { const b = e.target.closest(".tool"); if (b) setTool(b.dataset.tool); });
  $("eColor").addEventListener("input", e => setColor(e.target.value));
  $("eHex").addEventListener("change", e => {
    let v = e.target.value.trim(); if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) setColor(v); else e.target.value = ed.color;
  });
  $("eModel").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b || b.dataset.v === ed.model) return;
    ed.model = b.dataset.v; ed.dirty = true; syncSeg("eModel", ed.model);
    if (ed.p3d) ed.p3d.setModel(ed.model);
    redraw();
  });
  $("eMode").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b || b.dataset.v === ed.mode) return;
    setMode(b.dataset.v);
  });
  $("eLayer").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) setLayer(b.dataset.v); });
  $("eShowBase").addEventListener("change", e => setShow("base", e.target.checked));
  $("eShowOuter").addEventListener("change", e => setShow("outer", e.target.checked));
  $("eMirror").addEventListener("change", e => { ed.mirror = e.target.checked; });
  const setNoise = v => { ed.noise = v / 100; $("eNoise").value = v; $("eNoiseOut").textContent = v + " %"; };
  try { const v = Number(localStorage.getItem(NOISE_KEY)); if (v >= 5 && v <= 100) setNoise(v); } catch (e) { /* ignore */ }
  $("eNoise").addEventListener("input", e => {
    setNoise(Number(e.target.value));
    try { localStorage.setItem(NOISE_KEY, e.target.value); } catch (err) { /* ignore */ }
  });
  ["eGrid", "eRegions"].forEach(id => $(id).addEventListener("change", () => drawTexCanvas()));
  $("eUndo").addEventListener("click", undo);
  $("eRedo").addEventListener("click", redoFn);
  $("eCancel").addEventListener("click", requestClose);
  $("eDiscardYes").addEventListener("click", close);
  $("eDiscardNo").addEventListener("click", () => { $("eDiscard").hidden = true; });
  $("eSave").addEventListener("click", () => save(false));
  $("eSaveCopy").addEventListener("click", () => save(true));
  $("eName").addEventListener("input", () => { ed.dirty = true; });
  $("editor").addEventListener("cancel", e => { e.preventDefault(); requestClose(); });
  const typing = e => e.target.matches("input[type=text], input:not([type]), textarea");
  $("editor").addEventListener("keydown", e => {
    if (typing(e)) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redoFn() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redoFn(); return; }
    if (mod) return;
    if (e.key === " " && ed.mode === "3d") {
      // hold space and drag to turn the figure
      e.preventDefault();
      if (!ed.space && !ed.stroke) { ed.space = true; syncRotate(); }
      return;
    }
    if (e.key.toLowerCase() === "m") { ed.mirror = !ed.mirror; $("eMirror").checked = ed.mirror; return; }
    const map = { b: "pencil", e: "eraser", n: "noise", g: "fill", i: "picker", r: "rotate" };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  });
  $("editor").addEventListener("keyup", e => { if (e.key === " " && ed.space) { e.preventDefault(); ed.space = false; syncRotate(); } });
  window.addEventListener("blur", () => { if (ed.space) { ed.space = false; syncRotate(); } });
}
