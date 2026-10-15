// Editor extras: copy parts or an area from another skin of the library, adjust or replace colours,
// clothing stamps, and the palette of colours used in the skin.
import { t, applyI18n } from "./i18n.js";
import { $ } from "./dom.js";
import { parts, renderFigure, legacyTo64, loadImage, mirrorPixel } from "./skin.js";

let api = null;   // from editor.js: { ed, snapshot, redraw, setColor, aw, library, markDirty }
const PART_IDS = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];
const SIDES = ["front", "back", "top", "bottom", "right", "left"];
const SWAP_PART = { rightArm: "leftArm", leftArm: "rightArm", rightLeg: "leftLeg", leftLeg: "rightLeg" };
const SWAP_SIDE = { right: "left", left: "right" };

const canvas64 = () => { const c = document.createElement("canvas"); c.width = c.height = 64; return c; };
const ctx2d = c => c.getContext("2d", { willReadFrequently: true });
function cloneTex() { const c = canvas64(); ctx2d(c).drawImage(api.ed.tex, 0, 0); return c; }
function el(html) { const d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (r, g, b) => "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

function dialog(id, titleKey, body, okKey) {
  const d = el(`<dialog id="${id}" class="sheet narrow ex-dlg" aria-labelledby="${id}T">
    <div class="sheet-inner">
      <div class="sheet-top"><h2 class="sheet-title" id="${id}T" data-i18n="${titleKey}"></h2><span class="spacer"></span>
        <button class="btn icon-only ex-x" data-i18n-title="close"><svg class="ic"><use href="#i-x"/></svg></button></div>
      ${body}
      <div class="row ex-actions"><button class="btn ex-cancel" data-i18n="cancel"></button><button class="btn primary ex-ok" data-i18n="${okKey}"></button></div>
    </div></dialog>`);
  document.body.appendChild(d);
  return d;
}
function segSync(seg, v) { seg.querySelectorAll("button[data-v]").forEach(b => b.setAttribute("aria-pressed", String(Array.isArray(v) ? v.includes(b.dataset.v) : b.dataset.v === v))); }

// ======================================================================================
// palette: every colour used in the skin, most used first
// ======================================================================================
export function renderPalette() {
  if (!api || !api.ed.tex) return;
  const d = ctx2d(api.ed.tex).getImageData(0, 0, 64, 64).data, count = new Map();
  for (const f of faceRects()) {
    const [x0, y0, w, h] = f;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = (y * 64 + x) * 4;
      if (d[i + 3] < 24) continue;
      const k = toHex(d[i], d[i + 1], d[i + 2]);
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  const list = [...count].sort((a, b) => b[1] - a[1]).slice(0, 48).map(([c]) => c);
  $("ePalette").replaceChildren(...list.map(c => {
    const b = document.createElement("button");
    b.type = "button"; b.style.background = c; b.title = c; b.setAttribute("aria-label", c);
    b.addEventListener("click", () => api.pickColor(c));
    return b;
  }));
  $("ePaletteCount").textContent = count.size ? String(count.size) : "";
}
function faceRects(aw = api.aw()) {
  const out = [];
  for (const p of parts(aw)) for (const s of SIDES) out.push(p.faces[s]);
  return out;
}

// ======================================================================================
// copy from another skin
// ======================================================================================
const cp = { src: null, srcTex: null, srcAw: 4, mode: "parts", parts: ["head"], sides: [...SIDES], layers: ["base", "outer"], mirror: false, rect: null, drag: null };

function copyInto(dst) {
  // dst: canvas 64x64 to change. Copies pixels from cp.srcTex according to the selection.
  if (!cp.srcTex) return;
  const s = ctx2d(cp.srcTex).getImageData(0, 0, 64, 64).data, dctx = ctx2d(dst), img = dctx.getImageData(0, 0, 64, 64), d = img.data;
  const put = (dx, dy, sx, sy) => { const a = (sy * 64 + sx) * 4, b = (dy * 64 + dx) * 4; d[b] = s[a]; d[b + 1] = s[a + 1]; d[b + 2] = s[a + 2]; d[b + 3] = s[a + 3]; };
  const dstAw = api.aw();
  if (cp.mode === "area") {
    if (!cp.rect) return;
    const [x0, y0, x1, y1] = cp.rect;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const m = cp.mirror ? mirrorPixel(dstAw, x, y) : [x, y];
      if (m) put(m[0], m[1], x, y);
    }
  } else {
    const sp = parts(cp.srcAw), dp = parts(dstAw);
    for (const id of cp.parts) for (const layer of cp.layers) for (const side of cp.sides) {
      const did = cp.mirror ? (SWAP_PART[id] || id) : id, dside = cp.mirror ? (SWAP_SIDE[side] || side) : side;
      const [sx, sy, sw, sh] = sp.find(p => p.id === id && p.layer === layer).faces[side];
      const [tx, ty, tw, th] = dp.find(p => p.id === did && p.layer === layer).faces[dside];
      // faces of slim and classic arms differ in width: stretch with nearest pixels
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
        const si = Math.min(sw - 1, Math.floor(i * sw / tw)), sj = Math.min(sh - 1, Math.floor(j * sh / th));
        put(tx + i, ty + j, sx + (cp.mirror ? sw - 1 - si : si), sy + sj);
      }
    }
  }
  dctx.putImageData(img, 0, 0);
}

function drawCopyUi() {
  const c = $("cpSrc"), x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, c.width, c.height);
  if (!cp.srcTex) return;
  const k = c.width / 64;
  x.drawImage(cp.srcTex, 0, 0, c.width, c.height);
  // dim what is not copied
  x.save(); x.beginPath(); x.rect(0, 0, c.width, c.height);
  if (cp.mode === "area") { if (cp.rect) { const [a, b, e, f] = cp.rect; x.rect(a * k, b * k, (e - a + 1) * k, (f - b + 1) * k); } }
  else for (const p of parts(cp.srcAw)) if (cp.parts.includes(p.id) && cp.layers.includes(p.layer)) for (const s of cp.sides) { const [a, b, w, h] = p.faces[s]; x.rect(a * k, b * k, w * k, h * k); }
  x.fillStyle = "rgba(10,14,22,.62)"; x.fill("evenodd"); x.restore();
  if (cp.mode === "area" && cp.rect) { const [a, b, e, f] = cp.rect; x.strokeStyle = "#5b8cff"; x.lineWidth = 2; x.strokeRect(a * k + 1, b * k + 1, (e - a + 1) * k - 2, (f - b + 1) * k - 2); }
  // result preview on the edited skin
  const out = cloneTex(); copyInto(out);
  renderFigure($("cpFront"), out, api.ed.model, "front");
  renderFigure($("cpBack"), out, api.ed.model, "back");
  $("cpOk").disabled = cp.mode === "area" ? !cp.rect : !(cp.parts.length && cp.sides.length && cp.layers.length);
}

async function chooseSource(skin) {
  cp.src = skin;
  const img = await loadImage(skin.data);
  cp.srcTex = canvas64();
  ctx2d(cp.srcTex).drawImage(img.height === 32 ? legacyTo64(img) : img, 0, 0);
  cp.srcAw = skin.model === "slim" ? 3 : 4;
  $("cpList").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.id === skin.id)));
  drawCopyUi();
}

function syncCopy() {
  segSync($("cpMode"), cp.mode);
  segSync($("cpParts"), cp.parts);
  segSync($("cpSides"), cp.sides.length === SIDES.length ? ["all", ...SIDES] : cp.sides);
  segSync($("cpLayers"), cp.layers.length === 2 ? "both" : cp.layers[0]);
  $("cpPartsBox").hidden = cp.mode !== "parts";
  $("cpAreaHint").hidden = cp.mode !== "area";
  $("cpMirror").checked = cp.mirror;
  drawCopyUi();
}

async function openCopy() {
  const lib = api.library();
  const list = $("cpList");
  list.replaceChildren(...await Promise.all(lib.map(async s => {
    const b = el(`<button type="button" class="cp-skin" data-id="${s.id}"><canvas width="16" height="32"></canvas><span></span></button>`);
    b.querySelector("span").textContent = s.name;
    const img = await loadImage(s.data);
    renderFigure(b.querySelector("canvas"), img, s.model, "front", { legacy: s.fmt === "64x32" });
    b.addEventListener("click", () => chooseSource(s));
    return b;
  })));
  $("cpEmpty").hidden = lib.length > 0;
  cp.rect = null;
  $("cpDlg").showModal();
  if (lib.length) await chooseSource(cp.src && lib.find(s => s.id === cp.src.id) || lib.find(s => !api.ed.skin || s.id !== api.ed.skin.id) || lib[0]);
  syncCopy();
}

function setupCopy() {
  const d = dialog("cpDlg", "copyTitle", `
    <p class="hint" data-i18n="copyIntro"></p>
    <div class="cp-list" id="cpList"></div>
    <p class="hint" id="cpEmpty" hidden data-i18n="copyNoSkins"></p>
    <div class="cp-body">
      <div class="cp-srcwrap"><canvas id="cpSrc" width="320" height="320"></canvas><p class="hint" id="cpAreaHint" data-i18n="copyAreaHint"></p></div>
      <div class="cp-opts">
        <span class="seg" id="cpMode"><button data-v="parts" data-i18n="copyParts"></button><button data-v="area" data-i18n="copyArea"></button></span>
        <div id="cpPartsBox" class="cp-opts">
          <div class="seg wrap" id="cpParts">${PART_IDS.map(p => `<button data-v="${p}" data-i18n="part_${p}"></button>`).join("")}</div>
          <div class="row tight"><button class="chip" data-quick="arms" data-i18n="copyBothArms"></button><button class="chip" data-quick="legs" data-i18n="copyBothLegs"></button><button class="chip" data-quick="all" data-i18n="copyAll"></button></div>
          <span class="seg-label" data-i18n="copySides"></span>
          <div class="seg wrap" id="cpSides"><button data-v="all" data-i18n="all"></button>${SIDES.map(s => `<button data-v="${s}" data-i18n="side_${s}"></button>`).join("")}</div>
          <span class="seg-label" data-i18n="copyLayers"></span>
          <span class="seg" id="cpLayers"><button data-v="both" data-i18n="copyBoth"></button><button data-v="base" data-i18n="layerBase"></button><button data-v="outer" data-i18n="layerOuter"></button></span>
        </div>
        <label class="check-line"><input type="checkbox" id="cpMirror"> <span data-i18n="copyMirror"></span></label>
        <div class="flat2 cp-prev"><figure><div class="stage"><canvas id="cpFront" width="16" height="32"></canvas></div><figcaption data-i18n="front"></figcaption></figure>
          <figure><div class="stage"><canvas id="cpBack" width="16" height="32"></canvas></div><figcaption data-i18n="back"></figcaption></figure></div>
      </div>
    </div>`, "copyApply");
  d.querySelector(".ex-ok").id = "cpOk";
  applyI18n(d);
  const close = () => d.close();
  d.querySelector(".ex-x").addEventListener("click", close);
  d.querySelector(".ex-cancel").addEventListener("click", close);
  d.querySelector(".ex-ok").addEventListener("click", () => {
    api.snapshot(); copyInto(api.ed.tex); api.markDirty(); api.redraw(); close();
  });
  $("cpMode").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { cp.mode = b.dataset.v; syncCopy(); } });
  $("cpParts").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    const v = b.dataset.v;
    cp.parts = cp.parts.includes(v) ? cp.parts.filter(p => p !== v) : [...cp.parts, v];
    syncCopy();
  });
  d.querySelectorAll("[data-quick]").forEach(b => b.addEventListener("click", () => {
    cp.parts = { arms: ["rightArm", "leftArm"], legs: ["rightLeg", "leftLeg"], all: [...PART_IDS] }[b.dataset.quick];
    syncCopy();
  }));
  $("cpSides").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    const v = b.dataset.v;
    if (v === "all") cp.sides = cp.sides.length === SIDES.length ? [] : [...SIDES];
    else cp.sides = cp.sides.includes(v) ? cp.sides.filter(s => s !== v) : [...cp.sides, v];
    syncCopy();
  });
  $("cpLayers").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    cp.layers = b.dataset.v === "both" ? ["base", "outer"] : [b.dataset.v];
    syncCopy();
  });
  $("cpMirror").addEventListener("change", e => { cp.mirror = e.target.checked; drawCopyUi(); });
  // area: drag a frame on the source texture
  const c = $("cpSrc");
  const at = e => { const r = c.getBoundingClientRect(); return [Math.max(0, Math.min(63, Math.floor((e.clientX - r.left) / r.width * 64))), Math.max(0, Math.min(63, Math.floor((e.clientY - r.top) / r.height * 64)))]; };
  c.addEventListener("pointerdown", e => {
    if (!cp.srcTex) return;
    if (cp.mode !== "area") { cp.mode = "area"; syncCopy(); }
    c.setPointerCapture(e.pointerId);
    cp.drag = at(e); const [x, y] = cp.drag; cp.rect = [x, y, x, y]; drawCopyUi();
  });
  c.addEventListener("pointermove", e => {
    if (!cp.drag) return;
    const [x, y] = at(e), [a, b] = cp.drag;
    cp.rect = [Math.min(a, x), Math.min(b, y), Math.max(a, x), Math.max(b, y)];
    drawCopyUi();
  });
  const up = () => { cp.drag = null; };
  c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
}

// ======================================================================================
// adjust colours: shift hue/saturation/lightness, or replace one colour (keeping its shading)
// ======================================================================================
const ad = { scope: "all", from: null, tol: 12, mode: "shift", h: 0, s: 0, l: 0, to: "#d23a2a", base: null };

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function inScope(x, y, d, i) {
  if (d[i + 3] < 8) return false;
  if (ad.scope === "base" || ad.scope === "outer") {
    return parts(api.aw()).some(p => p.layer === ad.scope && SIDES.some(s => { const [a, b, w, h] = p.faces[s]; return x >= a && y >= b && x < a + w && y < b + h; }));
  }
  if (ad.scope === "color") {
    if (!ad.from) return false;
    const [r, g, b] = hexToRgb(ad.from);
    return Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) <= ad.tol * 3 * 2.55;
  }
  return true;
}
function applyAdjust() {
  const ctx = ctx2d(api.ed.tex);
  ctx.putImageData(ad.base, 0, 0);
  const img = ctx.getImageData(0, 0, 64, 64), d = img.data;
  const ref = ad.from ? rgbToHsl(...hexToRgb(ad.from)) : null, target = rgbToHsl(...hexToRgb(ad.to));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4;
    if (!inScope(x, y, d, i)) continue;
    let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (ad.mode === "shift") {
      h += ad.h; s = Math.max(0, Math.min(1, s * (1 + ad.s / 100))); l = Math.max(0, Math.min(1, l + ad.l / 200));
    } else {
      // take the new colour's hue and saturation; keep the light and dark steps of the old shading
      h = target[0]; s = target[1];
      l = Math.max(0, Math.min(1, target[2] + (l - (ref ? ref[2] : 0.5))));
    }
    const [r, g, b] = hslToRgb(h, s, l);
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  api.redraw();
}
function syncAdjust() {
  segSync($("adScope"), ad.scope); segSync($("adMode"), ad.mode);
  $("adColorBox").hidden = ad.scope !== "color";
  $("adShiftBox").hidden = ad.mode !== "shift"; $("adReplaceBox").hidden = ad.mode !== "replace";
  for (const k of ["h", "s", "l"]) { $("ad" + k.toUpperCase()).value = ad[k]; $("ad" + k.toUpperCase() + "Out").textContent = (ad[k] > 0 ? "+" : "") + ad[k] + (k === "h" ? "°" : " %"); }
  $("adTol").value = ad.tol; $("adTolOut").textContent = ad.tol + " %";
  $("adTo").value = ad.to;
  $("adFromSw").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.title === ad.from)));
  applyAdjust();
}
function openAdjust() {
  ad.base = ctx2d(api.ed.tex).getImageData(0, 0, 64, 64);
  ad.h = ad.s = ad.l = 0;
  // colours of the skin to pick "which colour"
  renderPalette();
  $("adFromSw").replaceChildren(...[...$("ePalette").children].map(src => {
    const b = document.createElement("button"); b.type = "button"; b.style.background = src.title; b.title = src.title;
    b.addEventListener("click", () => { ad.from = src.title; ad.scope = "color"; syncAdjust(); });
    return b;
  }));
  if (!ad.from && $("adFromSw").firstElementChild) ad.from = $("adFromSw").firstElementChild.title;
  $("adDlg").showModal();
  syncAdjust();
}
function setupAdjust() {
  const slider = (id, key, min, max) => `<label class="tool-opt"><span data-i18n="${key}"></span><input type="range" id="${id}" min="${min}" max="${max}" step="1" value="0"><output id="${id}Out"></output></label>`;
  const d = dialog("adDlg", "adjustTitle", `
    <div class="cp-opts">
      <span class="seg-label" data-i18n="adjustScope"></span>
      <span class="seg wrap" id="adScope"><button data-v="all" data-i18n="adjustAll"></button><button data-v="base" data-i18n="layerBase"></button><button data-v="outer" data-i18n="layerOuter"></button><button data-v="color" data-i18n="adjustOneColor"></button></span>
      <div id="adColorBox" class="cp-opts"><div class="swatches" id="adFromSw"></div>${slider("adTol", "adjustTolerance", 0, 60)}</div>
      <span class="seg" id="adMode"><button data-v="shift" data-i18n="adjustShift"></button><button data-v="replace" data-i18n="adjustReplace"></button></span>
      <div id="adShiftBox" class="cp-opts">${slider("adH", "adjustHue", -180, 180)}${slider("adS", "adjustSat", -100, 100)}${slider("adL", "adjustLight", -100, 100)}</div>
      <div id="adReplaceBox" class="cp-opts"><label class="pfp-row"><span data-i18n="adjustNewColor"></span><input type="color" id="adTo"></label><p class="hint" data-i18n="adjustReplaceHint"></p></div>
    </div>`, "adjustApply");
  applyI18n(d);
  const cancel = () => { if (d.open) { ctx2d(api.ed.tex).putImageData(ad.base, 0, 0); api.redraw(); d.close(); } };
  d.querySelector(".ex-x").addEventListener("click", cancel);
  d.querySelector(".ex-cancel").addEventListener("click", cancel);
  d.addEventListener("cancel", e => { e.preventDefault(); cancel(); });
  d.querySelector(".ex-ok").addEventListener("click", () => {
    // one undo step for the whole change
    const now = ctx2d(api.ed.tex).getImageData(0, 0, 64, 64);
    ctx2d(api.ed.tex).putImageData(ad.base, 0, 0); api.snapshot(); ctx2d(api.ed.tex).putImageData(now, 0, 0);
    api.markDirty(); api.redraw(); d.close();
  });
  $("adScope").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { ad.scope = b.dataset.v; syncAdjust(); } });
  $("adMode").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { ad.mode = b.dataset.v; syncAdjust(); } });
  for (const k of ["h", "s", "l"]) $("ad" + k.toUpperCase()).addEventListener("input", e => { ad[k] = Number(e.target.value); syncAdjust(); });
  $("adTol").addEventListener("input", e => { ad.tol = Number(e.target.value); syncAdjust(); });
  $("adTo").addEventListener("input", e => { ad.to = e.target.value; syncAdjust(); });
}

// ======================================================================================
// clothing stamps (own designs), painted onto the outer or the base layer
// ======================================================================================
/**
 * A stamp paints faces: fn(part, side, fx, fy, fw, fh) returns "main", "dark", "light", "detail",
 * "lens", "clear" or null (leave the pixel). fx/fy count from the top left of the face as it lies in
 * the texture: on side faces of the head "right" has the back on its left, "left" has the front on its left.
 */
const STAMPS = {
  hoodie: (p, s, x, y, w, h) => {
    if (p === "head") {
      if (s === "back") return y < 7 ? (y === 6 ? "dark" : "main") : null;
      if (s === "top") return y < 5 ? "main" : y === 5 ? "dark" : null;
      if (s === "right") return x < 4 && y < 7 ? (x === 3 ? "dark" : "main") : null;
      if (s === "left") return x > 3 && y < 7 ? (x === 4 ? "dark" : "main") : null;
      return null;
    }
    if (p === "body") {
      if (s === "bottom") return "dark";
      if (s === "top") return "main";
      if (y === h - 1) return "dark";
      if (s === "front") {
        if (y <= 3 && (x === 3 || x === 4)) return y === 3 ? "detail" : x === 3 ? "dark" : null;   // hood opening + strings
        if (y >= 7 && y <= 9 && x >= 1 && x <= 6) return y === 7 ? "dark" : "light";                // pocket
      }
      return "main";
    }
    if (p === "rightArm" || p === "leftArm") return s === "top" ? "main" : y >= h - 2 ? "dark" : "main";
    return null;
  },
  jacket: (p, s, x, y, w, h) => {
    if (p === "body") {
      if (s === "front") {
        if (x === 3 || x === 4) return y === 0 ? "dark" : "clear";
        if (y === 0) return "detail";                                          // collar
        if ((x === 2 || x === 5) && y % 3 === 1) return "light";                // buttons
        return y === h - 1 ? "dark" : "main";
      }
      if (s === "bottom") return null;
      return y === h - 1 ? "dark" : "main";
    }
    if (p === "rightArm" || p === "leftArm") return s === "bottom" ? null : y >= h - 1 ? "detail" : "main";
    return null;
  },
  glasses: (p, s, x, y) => {
    if (p !== "head") return null;
    if (s === "front" && y === 3) return x === 0 || x === 7 ? "detail" : x === 3 || x === 4 ? "detail" : "lens";
    if (s === "front" && y === 2 && x !== 0 && x !== 7) return x === 3 || x === 4 ? null : "detail";
    if (s === "right" && y === 3 && x >= 4) return "detail";
    if (s === "left" && y === 3 && x <= 3) return "detail";
    return null;
  },
  sunglasses: (p, s, x, y) => {
    if (p !== "head") return null;
    if (s === "front" && (y === 3 || y === 4)) return x === 0 || x === 7 ? "detail" : (x === 3 || x === 4) ? (y === 3 ? "detail" : null) : "dark-lens";
    if (s === "right" && y === 3 && x >= 4) return "detail";
    if (s === "left" && y === 3 && x <= 3) return "detail";
    return null;
  },
  cap: (p, s, x, y) => {
    if (p !== "head") return null;
    if (s === "top") return y >= 6 ? "dark" : x === 3 || x === 4 ? "detail" : "main";
    if (s === "front") return y === 0 ? "main" : y === 1 ? "dark" : null;
    if (s === "back") return y === 0 ? "main" : y === 1 ? (x === 3 || x === 4 ? "detail" : "main") : null;
    if (s === "right" || s === "left") return y <= 1 ? "main" : null;
    return null;
  },
  beanie: (p, s, x, y) => {
    if (p !== "head") return null;
    if (s === "top") return (x + y) % 3 === 0 ? "light" : "main";
    if (s === "bottom") return null;
    if (y > 2) return null;
    return y === 2 ? "detail" : x % 2 ? "light" : "main";
  },
  scarf: (p, s, x, y, w, h) => {
    if (p === "body") {
      if (s === "bottom") return null;
      if (s === "top") return "main";
      if (y <= 1) return (x + y) % 3 === 0 ? "detail" : y === 1 ? "dark" : "main";
      if (s === "front" && x >= 1 && x <= 2 && y <= 7) return y === 7 ? "detail" : y % 2 ? "main" : "light";
      return null;
    }
    if (p === "head" && s !== "top" && s !== "bottom" && y === 7) return "main";
    return null;
  },
  crown: (p, s, x, y) => {
    if (p !== "head") return null;
    if (s === "top") return (x === 0 || x === 7 || y === 0 || y === 7) ? "main" : null;
    if (s === "bottom") return null;
    if (y === 1) return "dark";
    if (y === 0) return x % 2 === 0 ? (x === 4 && s === "front" ? "detail" : "main") : null;
    if (y === 2 && s === "front" && (x === 3 || x === 4)) return null;
    return null;
  },
  belt: (p, s, x, y, w, h) => {
    if (p !== "body" || s === "top" || s === "bottom") return null;
    if (y !== 8 && y !== 9) return null;
    if (s === "front" && (x === 3 || x === 4)) return "detail";
    return y === 9 ? "dark" : "main";
  },
  sneakers: (p, s, x, y, w, h) => {
    if (p !== "rightLeg" && p !== "leftLeg") return null;
    if (s === "top") return null;
    if (s === "bottom") return "detail";
    if (y < 9) return null;
    if (y === h - 1) return "detail";                                           // sole
    if (s === "front" && y === 9 && (x === 1 || x === 2)) return "light";       // laces
    return "main";
  },
};
const st2 = { stamp: "hoodie", layer: "outer", main: "#3b6fe0", detail: "#f2f2f2", base: null };

function stampInto(dst, name) {
  const fn = STAMPS[name], ctx = ctx2d(dst), img = ctx.getImageData(0, 0, 64, 64), d = img.data;
  const main = hexToRgb(st2.main), det = hexToRgb(st2.detail);
  const tones = {
    main, dark: main.map(v => v * 0.72), light: main.map(v => Math.min(255, v * 1.18 + 12)), detail: det,
    lens: [170, 215, 245], "dark-lens": [24, 24, 30],
  };
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const p of parts(api.aw())) {
    if (p.layer !== st2.layer) continue;
    for (const s of SIDES) {
      const [fx0, fy0, fw, fh] = p.faces[s];
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const k = fn(p.id, s, x, y, fw, fh);
        if (!k) continue;
        const i = ((fy0 + y) * 64 + fx0 + x) * 4;
        if (k === "clear") { if (st2.layer === "outer") d[i + 3] = 0; continue; }
        const c = tones[k], f = k === "lens" || k === "dark-lens" ? 1 : 0.95 + rnd() * 0.1;   // a little fabric grain
        d[i] = Math.min(255, c[0] * f); d[i + 1] = Math.min(255, c[1] * f); d[i + 2] = Math.min(255, c[2] * f);
        d[i + 3] = k === "lens" ? (st2.layer === "outer" ? 140 : 255) : 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
function previewStamps() {
  for (const b of $("stList").querySelectorAll("button")) {
    const out = cloneTex(); stampInto(out, b.dataset.v);
    renderFigure(b.querySelector("canvas"), out, api.ed.model, "front");
    b.setAttribute("aria-pressed", String(b.dataset.v === st2.stamp));
  }
  const out = cloneTex(); stampInto(out, st2.stamp);
  renderFigure($("stFront"), out, api.ed.model, "front");
  renderFigure($("stBack"), out, api.ed.model, "back");
  segSync($("stLayer"), st2.layer);
}
function openStamps() {
  st2.main = api.ed.color; st2.detail = api.ed.color2 || "#f2f2f2";
  $("stMain").value = st2.main; $("stDetail").value = st2.detail;
  $("stDlg").showModal();
  previewStamps();
}
function setupStamps() {
  const d = dialog("stDlg", "stampTitle", `
    <p class="hint" data-i18n="stampIntro"></p>
    <div class="st-list" id="stList">${Object.keys(STAMPS).map(k => `<button type="button" data-v="${k}"><canvas width="16" height="32"></canvas><span data-i18n="stamp_${k}"></span></button>`).join("")}</div>
    <div class="cp-body">
      <div class="cp-opts">
        <label class="pfp-row"><span data-i18n="stampMain"></span><input type="color" id="stMain"></label>
        <label class="pfp-row"><span data-i18n="stampDetail"></span><input type="color" id="stDetail"></label>
        <span class="seg" id="stLayer"><button data-v="outer" data-i18n="layerOuter"></button><button data-v="base" data-i18n="layerBase"></button></span>
      </div>
      <div class="flat2 cp-prev"><figure><div class="stage"><canvas id="stFront" width="16" height="32"></canvas></div><figcaption data-i18n="front"></figcaption></figure>
        <figure><div class="stage"><canvas id="stBack" width="16" height="32"></canvas></div><figcaption data-i18n="back"></figcaption></figure></div>
    </div>`, "stampApply");
  applyI18n(d);
  const close = () => d.close();
  d.querySelector(".ex-x").addEventListener("click", close);
  d.querySelector(".ex-cancel").addEventListener("click", close);
  d.querySelector(".ex-ok").addEventListener("click", () => { api.snapshot(); stampInto(api.ed.tex, st2.stamp); api.markDirty(); api.redraw(); close(); });
  $("stList").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { st2.stamp = b.dataset.v; previewStamps(); } });
  $("stLayer").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) { st2.layer = b.dataset.v; previewStamps(); } });
  $("stMain").addEventListener("input", e => { st2.main = e.target.value; previewStamps(); });
  $("stDetail").addEventListener("input", e => { st2.detail = e.target.value; previewStamps(); });
}

/** Wire everything once; the editor hands over what the extras need. */
export function setupExtras(editorApi) {
  api = editorApi;
  setupCopy(); setupAdjust(); setupStamps();
  $("eCopyBtn").addEventListener("click", openCopy);
  $("eAdjustBtn").addEventListener("click", openAdjust);
  $("eStampBtn").addEventListener("click", openStamps);
}
/** For automated tests. */
export const extrasDebug = () => ({ cp, ad, st2 });
