import { t, applyI18n, setLang, getLang } from "./i18n.js";
import { db, newId, askPersist } from "./db.js";
import { renderFigure, detectModel, loadImage, REGIONS } from "./skin.js";
import { openEditor, editorOpen, setupEditor } from "./editor.js";
import { startPresentation, stopPresentation, presenting, setupPresentation } from "./present.js";
import { buildFigure } from "./fig3d.js";
import { reveal, bindTilt, trackScroll, splitTitle } from "./motion.js";
import { $, on, safe, setErrorReporter } from "./dom.js";
import { load3d, pixelRatio } from "./view3d.js";

// filters: slim/classic are "either", fav narrows to favourites; none active = all
const state = { skins: [], view: "front", filters: { slim: false, classic: false, fav: false }, sort: "new", search: "", current: null };
const UI_KEY = "skin-library-ui";

// ---------- small helpers ----------
export function toast(msg, err = false) {
  const el = document.createElement("div");
  el.className = "toast" + (err ? " err" : "");
  el.textContent = msg;
  $("toasts").appendChild(el);
  while ($("toasts").children.length > 3) $("toasts").firstElementChild.remove();
  setTimeout(() => el.remove(), err ? 6000 : 3200);
}

const imgCache = new Map();
export function imageOf(skin) {
  const key = skin.id + ":" + skin.updated;
  if (!imgCache.has(key)) imgCache.set(key, loadImage(skin.data));
  return imgCache.get(key);
}

function seg(id, value, onChange) {
  const root = $(id);
  const sync = v => root.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  sync(value);
  root.addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    sync(b.dataset.v);
    onChange(b.dataset.v);
  });
  return sync;
}

function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ view: state.view, filters: state.filters, sort: state.sort })); } catch (e) { /* ignore */ }
}
function loadUi() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(UI_KEY) || "{}") || {}; } catch (e) { /* ignore */ }
  if (["front", "back", "tex"].includes(saved.view)) state.view = saved.view;
  if (["new", "old", "name"].includes(saved.sort)) state.sort = saved.sort;
  if (saved.filters && typeof saved.filters === "object") for (const k of Object.keys(state.filters)) state.filters[k] = !!saved.filters[k];
  else if (saved.filter in state.filters) state.filters[saved.filter] = true; // older versions had one filter
}

function matchesFilters(s) {
  const f = state.filters;
  if ((f.slim || f.classic) && !((f.slim && s.model === "slim") || (f.classic && s.model === "classic"))) return false;
  return !f.fav || s.fav;
}

/** All | Slim | Classic | star: the last three combine freely, All clears them. */
function setupFilters() {
  const root = $("filterSeg");
  const sync = () => {
    const none = !Object.values(state.filters).some(Boolean);
    root.querySelectorAll("button[data-v]").forEach(b =>
      b.setAttribute("aria-pressed", String(b.dataset.v === "all" ? none : !!state.filters[b.dataset.v])));
  };
  sync();
  root.addEventListener("click", e => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    const v = b.dataset.v;
    if (v === "all") for (const k of Object.keys(state.filters)) state.filters[k] = false;
    else state.filters[v] = !state.filters[v];
    sync(); saveUi(); renderGrid();
  });
}

function download(href, filename) {
  const a = document.createElement("a");
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
const safeName = s => (s || "skin").replace(/[^\p{L}\p{N}_\- ]+/gu, "").trim().replace(/\s+/g, "_") || "skin";

// ---------- grid ----------
function visibleSkins() {
  const q = state.search.trim().toLowerCase();
  let list = state.skins.filter(s =>
    matchesFilters(s) &&
    (!q || s.name.toLowerCase().includes(q)));
  const by = {
    new: (a, b) => b.created - a.created,
    old: (a, b) => a.created - b.created,
    name: (a, b) => a.name.localeCompare(b.name, getLang(), { numeric: true }),
  }[state.sort];
  return list.sort(by);
}

async function drawThumb(canvas, skin) {
  const img = await imageOf(skin);
  if (state.view === "tex") {
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  } else {
    renderFigure(canvas, img, skin.model, state.view, { legacy: skin.fmt === "64x32" });
  }
}

// CSS 3D figures are ~80 elements each: keep them per skin version instead of rebuilding on every render
const figCache = new Map();
function cachedFigure(skin) {
  const key = `${skin.id}:${skin.updated}:${skin.model}:${skin.data.length}`;
  if (!figCache.has(key)) figCache.set(key, buildFigure(skin));
  return figCache.get(key);
}
function pruneFigures() {
  const keep = new Set(state.skins.map(s => `${s.id}:${s.updated}:${s.model}:${s.data.length}`));
  for (const k of figCache.keys()) if (!keep.has(k)) figCache.delete(k);
}
let gridFrame = 0;
/** Several changes in one frame (typing fast) render the grid once. */
function renderGridSoon() {
  if (gridFrame) return;
  gridFrame = requestAnimationFrame(() => { gridFrame = 0; renderGrid(); });
}

function renderGrid() {
  const grid = $("grid");
  const list = visibleSkins();
  const n = state.skins.length;
  $("emptyState").hidden = n > 0;
  $("toolbar").hidden = n === 0;
  $("presentBtn").disabled = list.length === 0;
  $("noMatch").hidden = !(n > 0 && list.length === 0);
  $("countLabel").textContent = n === 0 ? "" : list.length === n ? (n === 1 ? t("countOne") : t("countMany", { n })) : t("countFiltered", { shown: list.length, n });
  const is3d = state.view !== "tex";
  const cards = list.map(skin => {
    const b = document.createElement("button");
    b.className = "card";
    b.id = "card-" + skin.id;
    b.dataset.model = skin.model;
    b.setAttribute("aria-label", t("open") + ": " + skin.name);
    b.innerHTML = `<div class="stage${state.view === "tex" ? " tex" : ""}${is3d ? " is3d" : ""}">${is3d ? "" : "<canvas></canvas>"}</div>
      <div class="card-name"></div>
      <div class="card-meta"><span class="badge model">${skin.model === "slim" ? t("slim") : t("classic")}</span>${skin.fmt === "64x32" ? `<span class="badge">${t("badgeLegacy")}</span>` : ""}</div>
      <div class="card-date">${t("added")} ${new Date(skin.created).toLocaleDateString(getLang())}</div>
      ${skin.fav ? '<svg class="star" aria-hidden="true"><use href="#i-star"/></svg>' : ""}`;
    b.querySelector(".card-name").textContent = skin.name;
    if (is3d) {
      const stage = b.querySelector(".stage");
      stage.dataset.side = state.view;
      cachedFigure(skin).then(fig => { if (b.isConnected || !fig.parentNode) stage.appendChild(fig); });
      bindTilt(b);
    } else {
      drawThumb(b.querySelector("canvas"), skin);
    }
    b.addEventListener("click", () => openDetail(skin.id));
    return b;
  });
  grid.replaceChildren(...cards);
  pruneFigures();
  reveal(cards);
}

// ---------- import ----------
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function importFiles(files) {
  const added = [];
  const known = new Set(state.skins.map(s => s.data));
  const dups = [];
  let order = Date.now();
  for (const file of files) {
    const name = file.name.replace(/\.png$/i, "");
    let data, img;
    try {
      data = await readAsDataURL(file);
      if (!data.startsWith("data:image/png")) throw new Error("type");
      img = await loadImage(data);
    } catch (e) { toast(t("notImage", { name: file.name }), true); continue; }
    if (!(img.width === 64 && (img.height === 64 || img.height === 32))) { toast(t("badSize", { name: file.name, w: img.width, h: img.height }), true); continue; }
    if (known.has(data)) { dups.push(file.name); continue; }
    known.add(data);
    const now = order++;
    added.push({ id: newId(), name, data, model: detectModel(img), fmt: img.height === 32 ? "64x32" : "64x64", fav: false, notes: "", created: now, updated: now });
  }
  if (dups.length === 1) toast(t("skippedDup", { name: dups[0] }));
  else if (dups.length > 1) toast(t("skippedDups", { n: dups.length }));
  if (!added.length) return;
  try { await db.putMany(added); } catch (e) { toast(t("storageError"), true); return; }
  askPersist();
  state.skins.push(...added);
  renderGrid();
  toast(t("imported", { n: added.length }));
}

function setupDrop() {
  let depth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
  window.addEventListener("dragenter", e => { if (!hasFiles(e) || editorOpen()) return; depth++; $("dropOverlay").hidden = false; });
  window.addEventListener("dragleave", e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) $("dropOverlay").hidden = true; });
  window.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; $("dropOverlay").hidden = true;
    if (editorOpen()) return;
    importFiles(Array.from(e.dataTransfer.files).filter(f => f.type === "image/png" || /\.png$/i.test(f.name)));
  });
  const pick = () => $("fileInput").click();
  on("importBtn", "click", pick);
  on("emptyImportBtn", "click", pick);
  on("fileInput", "change", e => { importFiles(Array.from(e.target.files)); e.target.value = ""; });
}

// ---------- backup ----------
function exportBackup() {
  const payload = { app: "minecraft-skin-library", version: 1, exported: new Date().toISOString(), skins: state.skins };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: "application/json" }));
  download(url, `skin-library-backup-${new Date().toISOString().slice(0, 10)}.json`);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(t("backupSaved", { n: state.skins.length }));
}

async function importBackup(file) {
  let payload;
  try { payload = JSON.parse(await file.text()); } catch (e) { toast(t("backupBad"), true); return; }
  if (!payload || payload.app !== "minecraft-skin-library" || !Array.isArray(payload.skins)) { toast(t("backupBad"), true); return; }
  const ids = new Set(state.skins.map(s => s.id));
  const datas = new Set(state.skins.map(s => s.data));
  const fresh = [];
  for (const s of payload.skins) {
    if (!s || typeof s.data !== "string" || !s.data.startsWith("data:image/png;base64,")) continue;
    if (ids.has(s.id) || datas.has(s.data)) continue;
    fresh.push({
      id: typeof s.id === "string" ? s.id : newId(), name: String(s.name || t("untitled")).slice(0, 60), data: s.data,
      model: s.model === "slim" ? "slim" : "classic", fmt: s.fmt === "64x32" ? "64x32" : "64x64",
      fav: !!s.fav, notes: String(s.notes || ""), created: Number(s.created) || Date.now(), updated: Number(s.updated) || Date.now(),
    });
  }
  if (fresh.length) {
    try { await db.putMany(fresh); } catch (e) { toast(t("storageError"), true); return; }
    state.skins.push(...fresh);
    renderGrid();
  }
  toast(t("backupLoaded", { n: fresh.length }));
}

// ---------- detail ----------
let viewer = null, regionsOn = false, sv = null;
async function initViewer() {
  if (viewer) return viewer;
  const kit = await load3d();
  if (!kit || viewer) return viewer;
  try {
    sv = kit.sv;
    viewer = new sv.SkinViewer({ width: 300, height: 400, pixelRatio: pixelRatio() });
    $("dView3d").appendChild(viewer.canvas);
    viewer.autoRotate = true; viewer.autoRotateSpeed = 0.8; viewer.zoom = 0.85;
    // only draw while the detail sheet is open
    viewer.renderPaused = !$("detail").open;
    new ResizeObserver(() => { const r = $("dView3d").getBoundingClientRect(); if (r.width) viewer.setSize(r.width, r.height); }).observe($("dView3d"));
  } catch (e) { console.error("[skin-library] 3D view failed:", e); viewer = null; }
  return viewer;
}
export function setOuterLayer(v, on) {
  if (!v) return;
  const sk = v.playerObject.skin;
  ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"].forEach(p => { if (sk[p] && sk[p].outerLayer) sk[p].outerLayer.visible = on; });
}

export function drawTexture(canvas, img, labels) {
  const S = 10;
  canvas.width = img.width * S; canvas.height = img.height * S;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (labels) drawRegions(ctx, S, img.height);
}
export function drawRegions(ctx, S, h = 64) {
  const cs = getComputedStyle(document.documentElement);
  const acc = cs.getPropertyValue("--accent").trim();
  const fg = cs.getPropertyValue("--accent-fg").trim();
  const names = t("regionNames");
  ctx.font = `600 ${Math.round(S * 2.1)}px Figtree, sans-serif`;
  ctx.lineWidth = Math.max(2, S * 0.3);
  for (const [x, y, w, rh, key] of REGIONS) {
    if (y + rh > h) continue;
    ctx.strokeStyle = acc;
    ctx.strokeRect(x * S + ctx.lineWidth / 2, y * S + ctx.lineWidth / 2, w * S - ctx.lineWidth, rh * S - ctx.lineWidth);
    const label = names[key];
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = acc; ctx.fillRect(x * S + 3, y * S + 3, tw + S * 1.2, S * 2.8);
    ctx.fillStyle = fg; ctx.fillText(label, x * S + 3 + S * 0.6, y * S + 3 + S * 2.1);
  }
}

const byId = id => state.skins.find(s => s.id === id);

async function updateSkin(skin, patch) {
  Object.assign(skin, patch);
  try { await db.put(skin); } catch (e) { toast(t("storageError"), true); }
}

async function openDetail(id) {
  const skin = byId(id);
  if (!skin) return;
  state.current = id;
  const d = $("detail");
  $("dName").value = skin.name;
  syncFav(skin);
  $("dModel").textContent = skin.model === "slim" ? t("modelSlim") : t("modelClassic");
  $("dFmt").hidden = skin.fmt !== "64x32"; $("dFmt").textContent = t("badgeLegacy");
  $("dLegacy").hidden = skin.fmt !== "64x32";
  $("dNotes").value = skin.notes || "";
  $("dHow").innerHTML = t("mcHow", { model: skin.model === "slim" ? t("modelSlim") : t("modelClassic") });
  $("dAdded").textContent = t("added") + ": " + new Date(skin.created).toLocaleDateString(getLang());
  disarmDelete();
  if (!d.open) d.showModal();
  const v = await initViewer();
  if (state.current !== id) return;
  $("dFallback").hidden = !!v;
  if (v) v.renderPaused = false;
  const img = await imageOf(skin);
  if (state.current !== id) return;
  if (v) {
    try { await v.loadSkin(skin.data, { model: skin.model === "slim" ? "slim" : "default" }); } catch (e) { /* ignore */ }
    setOuterLayer(v, $("dOuter").getAttribute("aria-pressed") === "true");
  }
  const legacy = skin.fmt === "64x32";
  renderFigure($("dFront"), img, skin.model, "front", { legacy });
  renderFigure($("dBack"), img, skin.model, "back", { legacy });
  drawTexture($("dTex"), img, regionsOn);
}

function syncFav(skin) {
  const b = $("dFav");
  b.setAttribute("aria-pressed", String(!!skin.fav));
  b.querySelector("use").setAttribute("href", skin.fav ? "#i-star" : "#i-star-o");
  b.title = skin.fav ? t("unfav") : t("fav");
  b.setAttribute("aria-label", b.title);
}

function step(dir) {
  const list = visibleSkins();
  if (!list.length) return;
  const i = list.findIndex(s => s.id === state.current);
  const next = list[(i + dir + list.length) % list.length];
  openDetail(next.id);
}

let deleteArmed = false, deleteTimer = 0;
function disarmDelete() {
  deleteArmed = false; clearTimeout(deleteTimer);
  $("dDelete").classList.remove("armed"); $("dDelete").textContent = t("delete");
}

function setupDetail() {
  const d = $("detail");
  on("dClose", "click", () => d.close());
  d.addEventListener("click", e => { if (e.target === d) d.close(); });
  d.addEventListener("close", () => { state.current = null; if (viewer) viewer.renderPaused = true; renderGrid(); });
  d.addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });
  on("dPrev", "click", () => step(-1));
  on("dNext", "click", () => step(1));
  on("dName", "change", e => {
    const skin = byId(state.current); if (!skin) return;
    const name = e.target.value.trim() || t("untitled");
    e.target.value = name; updateSkin(skin, { name });
  });
  on("dNotes", "change", e => { const skin = byId(state.current); if (skin) updateSkin(skin, { notes: e.target.value }); });
  on("dFav", "click", () => { const skin = byId(state.current); if (!skin) return; updateSkin(skin, { fav: !skin.fav }); syncFav(skin); });
  const toggle = (id, fn) => on(id, "click", e => {
    const b = e.currentTarget, on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on)); fn(on);
  });
  toggle("dRot", on => { if (viewer) viewer.autoRotate = on; });
  toggle("dWalk", on => { if (viewer && sv) viewer.animation = on ? Object.assign(new sv.WalkingAnimation(), { speed: 0.6 }) : null; });
  toggle("dOuter", on => setOuterLayer(viewer, on));
  toggle("dRegions", async on => { regionsOn = on; const s = byId(state.current); if (s) drawTexture($("dTex"), await imageOf(s), on); });
  on("dExport", "click", () => { const s = byId(state.current); if (s) download(s.data, safeName(s.name) + ".png"); });
  on("dDup", "click", async () => {
    const s = byId(state.current); if (!s) return;
    const now = Date.now();
    const copy = { ...s, id: newId(), name: (s.name + " " + t("copySuffix")).slice(0, 60), fav: false, created: now, updated: now };
    try { await db.put(copy); } catch (e) { toast(t("storageError"), true); return; }
    state.skins.push(copy); toast(t("duplicated")); openDetail(copy.id);
  });
  on("dDelete", "click", async () => {
    if (!deleteArmed) {
      deleteArmed = true; $("dDelete").classList.add("armed"); $("dDelete").textContent = t("deleteConfirm");
      deleteTimer = setTimeout(disarmDelete, 3500); return;
    }
    const id = state.current; disarmDelete();
    try { await db.remove(id); } catch (e) { toast(t("storageError"), true); return; }
    state.skins = state.skins.filter(s => s.id !== id);
    d.close(); toast(t("deleted"));
  });
  on("dEdit", "click", () => {
    const s = byId(state.current); if (!s) return;
    d.close();
    startEditor(s);
  });
}

// ---------- editor bridge ----------
function startEditor(skin) {
  openEditor(skin, async result => {
    // result: { data, model, name, asCopy }
    const now = Date.now();
    let target;
    if (skin && !result.asCopy) {
      target = skin;
      Object.assign(target, { data: result.data, model: result.model, name: result.name, fmt: "64x64", updated: now });
    } else {
      target = { id: newId(), name: result.name, data: result.data, model: result.model, fmt: "64x64", fav: false, notes: skin && result.asCopy ? skin.notes : "", created: now, updated: now };
      state.skins.push(target);
    }
    try { await db.put(target); } catch (e) { toast(t("storageError"), true); return null; }
    askPersist();
    renderGrid();
    toast(t("saved"));
    setTimeout(() => openDetail(target.id), 50);
    return target;
  });
}

// ---------- settings ----------
const isDark = () => {
  const th = document.documentElement.dataset.theme;
  return th ? th === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};
function syncThemeBtn() {
  $("themeBtn").querySelector("use").setAttribute("href", isDark() ? "#i-sun" : "#i-moon");
}
function toggleTheme() {
  const v = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = v;
  try { localStorage.setItem("skin-library-theme", v); } catch (e) { /* ignore */ }
  syncThemeBtn();
  if ($("detail").open && state.current) openDetail(state.current);
}
function syncLangBtn() { $("langBtn").textContent = getLang().toUpperCase(); }
function present(startId) {
  const list = visibleSkins();
  if (!list.length) return;
  const i = Math.max(0, list.findIndex(s => s.id === startId));
  if ($("detail").open) $("detail").close();
  startPresentation(list, i, () => renderGrid());
}

function drawEmptyFigure() {
  // a tiny original mannequin for the empty state
  import("./skin.js").then(({ blankTemplate }) => renderFigure($("emptyFigure"), blankTemplate("classic"), "classic", "front"));
}

// ---------- boot ----------
// Every part is wired on its own: if one fails (missing element, 3D unavailable, ...),
// the others still work and the user sees a short message instead of a dead page.
let lastErr = 0;
function reportError() {
  if (Date.now() - lastErr < 4000) return;
  lastErr = Date.now();
  toast(t("partFailed"), true);
}

async function boot() {
  setErrorReporter(reportError);
  window.addEventListener("error", e => { if (e.error) reportError(); });
  window.addEventListener("unhandledrejection", () => reportError());
  safe("ui prefs", loadUi);
  safe("i18n", () => applyI18n());
  safe("title", () => { splitTitle(document.querySelector(".top h1")); trackScroll(); });
  safe("toolbar", () => {
    seg("viewSeg", state.view, v => { state.view = v; saveUi(); renderGrid(); });
    setupFilters();
    $("sortSelect").value = state.sort;
    on("sortSelect", "change", e => { state.sort = e.target.value; saveUi(); renderGrid(); });
    on("searchInput", "input", e => { state.search = e.target.value; renderGridSoon(); });
  });
  safe("theme", () => {
    syncThemeBtn();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncThemeBtn);
    on("themeBtn", "click", toggleTheme);
  });
  safe("language", () => {
    syncLangBtn();
    on("langBtn", "click", () => {
      setLang(getLang() === "en" ? "de" : "en"); syncLangBtn(); renderGrid();
      if ($("detail").open && state.current) openDetail(state.current);
    });
  });
  safe("new skin", () => {
    on("newBtn", "click", () => startEditor(null));
    on("emptyNewBtn", "click", () => startEditor(null));
  });
  safe("import", setupDrop);
  safe("presentation buttons", () => {
    on("presentBtn", "click", () => presenting() ? stopPresentation() : present(null));
    on("dPresent", "click", () => present(state.current));
  });
  safe("backup", () => {
    document.addEventListener("click", e => { if (!e.target.closest("#moreMenu")) $("moreMenu").open = false; });
    on("backupExportBtn", "click", () => { $("moreMenu").open = false; exportBackup(); });
    on("backupImportBtn", "click", () => { $("moreMenu").open = false; $("backupInput").click(); });
    on("backupInput", "change", e => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ""; });
  });
  safe("detail", setupDetail);
  safe("editor", setupEditor);
  safe("presentation", setupPresentation);
  safe("empty state", drawEmptyFigure);
  window.__skinLibraryBooted = true;
  try { state.skins = await db.all(); } catch (e) { state.skins = []; toast(t("storageError"), true); }
  safe("grid", renderGrid);
}

boot();
