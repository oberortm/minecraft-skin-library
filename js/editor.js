import { t, applyI18n } from "./i18n.js";
import { renderFigure, figureToTexture, faceAt, faceList, legacyTo64, blankTemplate, loadImage } from "./skin.js";
import { drawRegions, setOuterLayer } from "./app.js";

import { $ } from "./dom.js";
const S = 10; // texture canvas scale (64 px -> 640 px)
const RECENT_KEY = "skin-library-recent-colors";

const ed = {
  open: false, skin: null, onSave: null,
  tex: null, ctx: null,
  model: "classic", layer: "base", tool: "pencil", color: "#3b6fe0",
  undo: [], redo: [], dirty: false,
  stroke: null, hover: null, viewer: null, pending3d: false,
};

export const editorOpen = () => ed.open;

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
  ed.dirty = true; syncHistory(); redraw(true);
}
function redoFn() {
  if (!ed.redo.length) return;
  ed.undo.push(ed.ctx.getImageData(0, 0, 64, 64));
  ed.ctx.putImageData(ed.redo.pop(), 0, 0);
  ed.dirty = true; syncHistory(); redraw(true);
}

// ---------- applying tools ----------
function applyAt(x, y, first) {
  const tool = ed.tool;
  if (tool === "picker") {
    const p = getPx(x, y);
    if (p[3] > 0) setColor("#" + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, "0")).join(""));
    setTool("pencil");
    return false;
  }
  if (first) snapshot();
  if (tool === "fill") { flood(x, y, hexToRgba(ed.color)); return true; }
  setPx(x, y, tool === "eraser" ? [0, 0, 0, 0] : hexToRgba(ed.color));
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

function drawFigures() {
  const opts = { outer: $("eShowOuter").checked, dimLayer: ed.layer === "base" ? "outer" : null };
  renderFigure($("eFront"), ed.tex, ed.model, "front", opts);
  renderFigure($("eBack"), ed.tex, ed.model, "back", opts);
}

function update3d() {
  if (!ed.viewer || ed.pending3d) return;
  ed.pending3d = true;
  setTimeout(() => {
    ed.pending3d = false;
    try {
      ed.viewer.loadSkin(ed.tex, { model: ed.model === "slim" ? "slim" : "default" });
      setOuterLayer(ed.viewer, $("eShowOuter").checked);
    } catch (e) { /* ignore */ }
  }, 90);
}

function redraw(with3d) { drawTexCanvas(); drawFigures(); if (with3d) update3d(); }

// ---------- pointer handling ----------
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
    if (e.button !== 0) return;
    const p = toTex(e);
    if (!p) return;
    canvas.setPointerCapture(e.pointerId);
    const changed = applyAt(p[0], p[1], true);
    ed.stroke = changed && (ed.tool === "pencil" || ed.tool === "eraser") ? { last: p, canvas } : null;
    if (changed) { ed.dirty = true; redraw(true); }
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
        redraw(true);
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

// ---------- color & tools ----------
function setColor(hex) {
  ed.color = hex.toLowerCase();
  $("eColor").value = ed.color;
  $("eHex").value = ed.color;
}
function setTool(tool) {
  ed.tool = tool;
  document.querySelectorAll("#eTools .tool").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
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
    b.addEventListener("click", () => { setColor(c); if (ed.tool === "eraser" || ed.tool === "picker") setTool("pencil"); });
    return b;
  }));
}

function syncSeg(id, v) { $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v))); }

// ---------- open / close ----------
function initViewer() {
  if (ed.viewer || !window.skinview3d) return;
  try {
    ed.viewer = new skinview3d.SkinViewer({ width: 260, height: 260 });
    $("eView3d").appendChild(ed.viewer.canvas);
    ed.viewer.autoRotate = true; ed.viewer.autoRotateSpeed = 0.6; ed.viewer.zoom = 0.8;
    new ResizeObserver(() => { const r = $("eView3d").getBoundingClientRect(); if (r.width) ed.viewer.setSize(r.width, r.height); }).observe($("eView3d"));
  } catch (e) { ed.viewer = null; }
}

export async function openEditor(skin, onSave) {
  ed.skin = skin; ed.onSave = onSave;
  ed.tex = document.createElement("canvas"); ed.tex.width = 64; ed.tex.height = 64;
  ed.ctx = ed.tex.getContext("2d", { willReadFrequently: true });
  ed.ctx.imageSmoothingEnabled = false;
  ed.undo = []; ed.redo = []; ed.dirty = false; ed.hover = null;
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
  setTool("pencil");
  setColor(ed.color);
  renderRecent();
  syncHistory();
  applyI18n($("editor"));
  $("editor").showModal();
  ed.open = true;
  initViewer();
  redraw(true);
}

function close() { ed.open = false; ed.stroke = null; $("editor").close(); }
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
    ed.model = b.dataset.v; ed.dirty = true; syncSeg("eModel", ed.model); redraw(true);
  });
  $("eLayer").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    ed.layer = b.dataset.v; syncSeg("eLayer", ed.layer); redraw(false);
  });
  ["eGrid", "eRegions"].forEach(id => $(id).addEventListener("change", () => drawTexCanvas()));
  $("eShowOuter").addEventListener("change", () => redraw(true));
  $("eUndo").addEventListener("click", undo);
  $("eRedo").addEventListener("click", redoFn);
  $("eCancel").addEventListener("click", requestClose);
  $("eDiscardYes").addEventListener("click", close);
  $("eDiscardNo").addEventListener("click", () => { $("eDiscard").hidden = true; });
  $("eSave").addEventListener("click", () => save(false));
  $("eSaveCopy").addEventListener("click", () => save(true));
  $("eName").addEventListener("input", () => { ed.dirty = true; });
  $("editor").addEventListener("cancel", e => { e.preventDefault(); requestClose(); });
  $("editor").addEventListener("keydown", e => {
    if (e.target.matches("input[type=text], input:not([type]), textarea")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redoFn() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redoFn(); return; }
    if (mod) return;
    const map = { b: "pencil", e: "eraser", g: "fill", i: "picker" };
    if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  });
}
