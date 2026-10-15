// Presentation mode: one skin at a time, full screen, in a lit scene.
import { t, applyI18n } from "./i18n.js";

import { $ } from "./dom.js";
import { load3d } from "./view3d.js";
import { loadEquipment, saveEquipment, applyElytra, applyArmor, ARMOR_SLOTS, ARMOR_MATS, TRIM_PATTERNS, TRIM_MATS, applyItems, ITEMS, TOOL_MATS } from "./equipment.js";
import { readPack, packCanvases, savePack, loadPack, SOURCES, downloadSource, selectedSource, selectSource } from "./pack.js";
const KEY = "skin-library-present";
const QUALITY_KEY = "skin-library-mc-quality";
const savedQuality = () => { try { const q = localStorage.getItem(QUALITY_KEY); return q === "high" || q === "low" ? q : null; } catch (e) { return null; } };
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Two groups of four moods. Classic scenes are CSS backdrops behind the figure; Minecraft scenes
// are real block worlds built into the 3D scene (js/mcworld.js, loaded on first use).
export const SCENES = {
  classic: [
    { id: "studio", amb: ["#ffffff", 1.0], cam: ["#ffffff", 1.0], fx: null },
    { id: "spotlight", amb: ["#ffffff", 0.5], cam: ["#fff1d6", 2.4], fx: "dust" },
    // the scene sets the mood; on the skin itself only a light warm/cool sheen, colours stay true
    { id: "sunset", amb: ["#fff0e2", 0.95], cam: ["#ffd7b0", 1.15], fx: "embers" },
    { id: "night", amb: ["#eaf0ff", 0.9], cam: ["#dde7ff", 1.1], fx: "stars" },
  ],
  minecraft: [{ id: "mc-white" }, { id: "mc-dark" }, { id: "mc-sunrise" }, { id: "mc-night" }],
};
const GROUPS = Object.keys(SCENES);
const groupOf = id => GROUPS.find(g => SCENES[g].some(s => s.id === id)) || "classic";
const ANIMS = ["idle", "walk", "run", "fly"];

const st = {
  on: false, list: [], i: 0, viewer: null, sv: null, base: null, scene: "studio", anim: "idle", rotate: true,
  group: "classic", scenes: { classic: "studio", minecraft: "mc-sunrise" }, world: null, worldMod: null, token: 0,
  fx: { raf: 0, parts: [], mode: null }, idleTimer: 0, hdrTimer: 0, busy: false, onExit: null,
  // "reduce motion" in the system: start still, but a click on a motion button always wins
  motion: true,
  equip: loadEquipment(), packTex: null,
};

function prefs() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { /* ignore */ }
  if (saved.scenes && typeof saved.scenes === "object") {
    for (const g of GROUPS) if (SCENES[g].some(s => s.id === saved.scenes[g])) st.scenes[g] = saved.scenes[g];
  } else if (SCENES.classic.some(s => s.id === saved.scene)) st.scenes.classic = saved.scene; // older versions kept a single scene
  st.group = GROUPS.includes(saved.group) ? saved.group : "classic";
  st.scene = st.scenes[st.group];
  if (ANIMS.includes(saved.anim)) st.anim = saved.anim;
  if (typeof saved.rotate === "boolean") st.rotate = saved.rotate;
}
function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify({ group: st.group, scenes: st.scenes, anim: st.anim, rotate: st.rotate })); } catch (e) { /* ignore */ }
}

// ---------- 3D viewer ----------
async function initViewer() {
  if (st.viewer) return st.viewer;
  const kit = await load3d();
  if (!kit || st.viewer) return st.viewer;
  try {
    st.sv = kit.sv;
    const v = new kit.sv.SkinViewer({ width: 600, height: 800 });
    $("prStage").appendChild(v.canvas);
    v.zoom = 0.66;
    v.fov = 38;
    st.base = { amb: v.globalLight.intensity, cam: v.cameraLight.intensity };
    new ResizeObserver(() => {
      const r = $("prStage").getBoundingClientRect();
      if (!r.width) return;
      v.setSize(r.width, r.height);
      // keep the whole figure in view on tall, narrow screens
      v.zoom = Math.min(0.66, 0.66 * (r.width / r.height) / 0.95);
    }).observe($("prStage"));
    st.viewer = v;
    bindSkinDrag(v, kit.THREE);
  } catch (e) { console.error("[skin-library] presentation 3D failed:", e); st.viewer = null; }
  return st.viewer;
}

function renderSceneButtons() {
  document.querySelectorAll("#prGroups button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.group === st.group)));
  $("prScenes").replaceChildren(...SCENES[st.group].map(s => {
    const b = document.createElement("button");
    b.className = "pr-pill"; b.dataset.scene = s.id; b.id = "scene-" + s.id;
    b.setAttribute("aria-pressed", String(s.id === st.scene));
    b.innerHTML = `<i class="sw sw-${s.id}"></i><span data-i18n="scene_${s.id}"></span>`;
    b.addEventListener("click", () => applyScene(s.id));
    return b;
  }));
  applyI18n($("prScenes"));
}

async function applyScene(id) {
  const group = groupOf(id);
  const token = ++st.token;
  const groupChanged = group !== st.group;
  st.scene = id; st.group = group; st.scenes[group] = id;
  $("present").dataset.scene = id;
  $("present").dataset.group = group;
  if (groupChanged || !$("prScenes").children.length) renderSceneButtons();
  else document.querySelectorAll("#prScenes button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scene === id)));
  savePrefs();
  const v = st.viewer;
  if (group === "classic") {
    togglePanel(false);
    dropWorld();
    const sc = SCENES.classic.find(s => s.id === id);
    if (v && st.base) {
      v.globalLight.color.set(sc.amb[0]); v.globalLight.intensity = st.base.amb * sc.amb[1];
      v.cameraLight.color.set(sc.cam[0]); v.cameraLight.intensity = st.base.cam * sc.cam[1];
    }
    startFx(sc.fx);
    applyRotate(st.rotate);
    return;
  }
  startFx(null);
  if (!v) return;
  v.globalLight.color.set("#ffffff"); v.cameraLight.color.set("#ffffff");
  try {
    if (!st.world) {
      st.worldMod = st.worldMod || await import("./mcworld.js");
      if (token !== st.token || !st.on) return;
      const q = savedQuality();
      st.world = new st.worldMod.McWorld(v, q || st.worldMod.guessQuality(), !!q);
      applySavedPack();
    }
    st.world.setLook(id);
    applyRotate(st.rotate);
  } catch (e) {
    console.error("[skin-library] block world failed:", e);
    dropWorld();
  }
}

/** Back to the plain viewer: remove the block world and free its memory. */
function dropWorld() {
  if (!st.world) return;
  try { st.world.dispose(); } catch (e) { console.error("[skin-library] world cleanup failed:", e); }
  st.world = null;
}

// ---------- equipment ----------
async function applyEquipment() {
  const v = st.viewer;
  if (!v) return;
  try {
    await applyElytra(v, st.equip.elytra, st.packTex);
    const kit = await load3d();
    if (kit && st.viewer === v) {
      applyArmor(v, kit.THREE, st.equip.armor, st.packTex);
      applyItems(v, kit.THREE, st.equip.hands, st.packTex);
    }
  } catch (e) { console.error("[skin-library] equipment failed:", e); }
  if (st.world) st.world.skinChanged();
}
function syncEquipUi() {
  $("eqElytra").checked = !!st.equip.elytra;
  for (const slot of ARMOR_SLOTS) {
    const p = st.equip.armor[slot], row = document.querySelector(`.eq-slot[data-slot="${slot}"]`);
    row.querySelector(".eq-mat").value = p.mat || "";
    row.querySelector(".eq-dye").value = p.dye;
    row.querySelector(".eq-dye").hidden = p.mat !== "leather";
    row.querySelector(".eq-trim").value = p.trim || "";
    row.querySelector(".eq-trimmat").value = p.trimMat;
    row.querySelector(".eq-trimmat").disabled = !p.trim || !p.mat;
    row.querySelector(".eq-trim").disabled = !p.mat;
    row.querySelector(".eq-glint").checked = !!p.glint;
    row.querySelector(".eq-glint").disabled = !p.mat;
  }
  for (const hand of ["main", "off"]) {
    const h = st.equip.hands[hand], row = document.querySelector(`.eq-hand[data-hand="${hand}"]`);
    row.querySelector(".eq-item").value = h.item || "";
    row.querySelector(".eq-toolmat").value = h.mat;
    row.querySelector(".eq-toolmat").hidden = !h.item || !ITEMS[h.item];
    row.querySelector(".eq-glint").checked = !!h.glint;
    row.querySelector(".eq-glint").disabled = !h.item;
  }
}
/** Main hand and off hand: any item, its material for tools, enchanted. */
function buildItemsUi() {
  const opt = (v, key) => `<option value="${v}" data-i18n="${key}"></option>`;
  const items = opt("", "handEmpty") + Object.keys(ITEMS).map(i => opt(i, "item_" + i)).join("");
  const mats = TOOL_MATS.map(m => opt(m, "tool_" + m)).join("");
  $("eqItems").innerHTML = `<h3 data-i18n="items"></h3>` + ["main", "off"].map(hand => `
    <div class="eq-slot eq-hand" data-hand="${hand}" role="group" aria-labelledby="eq-${hand}">
      <span class="pr-panel-label" id="eq-${hand}" data-i18n="hand_${hand}"></span>
      <div class="pr-panel-row">
        <select class="pr-select eq-item" data-i18n-title="hand_${hand}">${items}</select>
        <select class="pr-select eq-toolmat" data-i18n-title="armorMaterial">${mats}</select>
        <label class="pr-check"><input type="checkbox" class="eq-glint"> <span data-i18n="enchanted"></span></label>
      </div>
    </div>`).join("");
  applyI18n($("eqItems"));
  $("eqItems").addEventListener("input", e => {
    const row = e.target.closest(".eq-hand");
    if (!row) return;
    const h = st.equip.hands[row.dataset.hand], el = e.target;
    if (el.classList.contains("eq-item")) h.item = el.value || null;
    else if (el.classList.contains("eq-toolmat")) h.mat = el.value;
    else if (el.classList.contains("eq-glint")) h.glint = el.checked;
    saveEquipment(st.equip); syncEquipUi(); applyEquipment();
  });
}
/** The armour rows: material (+ dye for leather), enchanted, trim pattern and trim material per piece. */
function buildArmorUi() {
  const opt = (v, key, text) => `<option value="${v}"${key ? ` data-i18n="${key}"` : ""}>${text || ""}</option>`;
  const mats = opt("", "armorNone") + ARMOR_MATS.map(m => opt(m, "mat_" + m)).join("");
  const trims = opt("", "trimNone") + TRIM_PATTERNS.map(p => opt(p, "", p[0].toUpperCase() + p.slice(1))).join("");
  const tmats = Object.keys(TRIM_MATS).map(m => opt(m, "tmat_" + m)).join("");
  $("eqArmor").innerHTML = `<h3 data-i18n="armor"></h3>` + ARMOR_SLOTS.map(slot => `
    <div class="eq-slot" data-slot="${slot}" role="group" aria-labelledby="eq-${slot}">
      <span class="pr-panel-label" id="eq-${slot}" data-i18n="armor_${slot}"></span>
      <div class="pr-panel-row">
        <select class="pr-select eq-mat" data-i18n-title="armorMaterial">${mats}</select>
        <input type="color" class="eq-dye" data-i18n-title="dyeColor">
        <label class="pr-check"><input type="checkbox" class="eq-glint"> <span data-i18n="enchanted"></span></label>
      </div>
      <div class="pr-panel-row">
        <select class="pr-select eq-trim" data-i18n-title="trimPattern">${trims}</select>
        <select class="pr-select eq-trimmat" data-i18n-title="trimMaterial">${tmats}</select>
      </div>
    </div>`).join("") + `<button class="pr-pill" id="eqAllSame" type="button" data-i18n="allSame" data-i18n-title="allSameHint"></button>`;
  applyI18n($("eqArmor"));
  $("eqArmor").addEventListener("input", e => {
    const row = e.target.closest(".eq-slot");
    if (!row) return;
    const slot = row.dataset.slot, p = st.equip.armor[slot], el = e.target;
    if (el.classList.contains("eq-mat")) {
      p.mat = el.value || null;
      // chestplate and elytra share the back, like in the game
      if (slot === "chest" && p.mat && st.equip.elytra) { st.equip.elytra = false; if (st.anim === "fly") applyAnim("idle", true); }
    } else if (el.classList.contains("eq-dye")) p.dye = el.value;
    else if (el.classList.contains("eq-trim")) p.trim = el.value || null;
    else if (el.classList.contains("eq-trimmat")) p.trimMat = el.value;
    else if (el.classList.contains("eq-glint")) p.glint = el.checked;
    st.lastSlot = slot;
    saveEquipment(st.equip); syncEquipUi(); applyEquipment();
  });
  $("eqAllSame").addEventListener("click", () => {
    // copy the piece changed last (or the first worn one) onto all four
    const from = st.equip.armor[st.lastSlot] && st.equip.armor[st.lastSlot].mat ? st.lastSlot : ARMOR_SLOTS.find(s => st.equip.armor[s].mat);
    if (!from) return;
    for (const s of ARMOR_SLOTS) st.equip.armor[s] = { ...st.equip.armor[from] };
    if (st.equip.elytra) { st.equip.elytra = false; if (st.anim === "fly") applyAnim("idle", true); }
    saveEquipment(st.equip); syncEquipUi(); applyEquipment();
  });
}
function setElytra(on) {
  st.equip.elytra = on;
  // the elytra takes the chestplate's place
  if (on) st.equip.armor.chest.mat = null;
  saveEquipment(st.equip);
  syncEquipUi();
  if (!on && st.anim === "fly") applyAnim("idle", true);
  applyEquipment();
}
function toggleEquipPanel(open = $("prEquipPanel").hidden) {
  if (open) togglePanel(false);
  $("prEquipPanel").hidden = !open;
  $("prEquip").setAttribute("aria-expanded", String(open));
  if (open) syncEquipUi();
}
/** Textures of the selected source, for the equipment (also when no block world is shown). */
async function loadPackTextures() {
  const id = await selectedSource();
  const pack = id === "builtin" ? null : await loadPack(id);
  st.packTex = pack ? await packCanvases(pack) : null;
  return st.packTex;
}

// ---------- texture source: built-in (default), Minecraft, three packs, own file ----------
async function applySavedPack() {
  const id = await selectedSource();
  syncPackUi(id);
  const tex = await loadPackTextures();
  if (st.world) st.world.setPack(tex);
  applyEquipment();
}
function setHint(text, err = false, link = null) {
  const hint = $("prPackHint");
  hint.textContent = "";
  if (link) {
    const [a, b] = text.split("{link}");
    const el = document.createElement("a"); el.href = link; el.target = "_blank"; el.rel = "noopener"; el.textContent = link.replace(/^https:\/\/(www\.)?/, "");
    hint.append(a, el, b || "");
  } else hint.textContent = text;
  hint.classList.toggle("err", err);
}
async function syncPackUi(id, pack) {
  $("prTexSource").value = id;
  $("prPackFileRow").hidden = id !== "file";
  if (id === "file") {
    pack = pack || await loadPack("file");
    $("prPackName").textContent = pack ? pack.name : "";
  }
  setHint(id === "builtin" ? t("texBuiltinHint") : id === "file" ? t("packHint") : id === "vanilla" ? t("texVanillaHint") : t("texDownloadHint"));
}
function progress(p) {
  $("prPackProgress").hidden = p === null;
  if (p === null) return;
  $("prPackBar").value = p < 0 ? undefined : p;
  if (p < 0) $("prPackBar").removeAttribute("value");
  $("prPackPct").textContent = p < 0 ? "…" : Math.round(p * 100) + " %";
}
async function chooseSource(id) {
  st.packSeq = (st.packSeq || 0) + 1;
  const prev = await selectedSource();
  if (id === "builtin") {
    selectSource("builtin"); st.packTex = null; if (st.world) st.world.setPack(null); applyEquipment(); syncPackUi("builtin"); return;
  }
  let pack = await loadPack(id);
  if (!pack) {
    $("prTexSource").disabled = true;
    progress(0);
    try {
      pack = await downloadSource(id, progress);
      await savePack(id, pack);
    } catch (e) {
      progress(null); $("prTexSource").disabled = false;
      syncPackUi(prev);
      setHint(t("texFailed"), true, SOURCES.find(s => s.id === id).page);
      return;
    }
    progress(null); $("prTexSource").disabled = false;
  }
  selectSource(id);
  st.packTex = await packCanvases(pack);
  if (st.world) st.world.setPack(st.packTex);
  applyEquipment();
  syncPackUi(id);
  setHint(t("texLoaded", { name: pack.name }));
}
async function choosePack(file) {
  st.packSeq = (st.packSeq || 0) + 1;
  setHint(t("packLoading"));
  try {
    const pack = await readPack(file);
    await savePack("file", pack);
    selectSource("file");
    st.packTex = await packCanvases(pack);
    if (st.world) st.world.setPack(st.packTex);
    applyEquipment();
    syncPackUi("file", pack);
  } catch (e) {
    // a wrong or empty file is a normal user mistake: explain it in the panel, no console noise
    syncPackUi(await selectedSource());
    setHint(t(e && e.message === "unsupported" ? "packUnsupported" : "packError"), true);
  }
}
function togglePanel(open = $("prWorldPanel").hidden) {
  if (open) toggleEquipPanel(false);
  $("prWorldPanel").hidden = !open;
  $("prWorld").setAttribute("aria-expanded", String(open));
  if (open) {
    const seq = st.packSeq = (st.packSeq || 0) + 1;
    selectedSource().then(id => { if (seq === st.packSeq) syncPackUi(id); });  // ignore if the user chose meanwhile
    syncQualityUi();
  }
}
function syncQualityUi() {
  const q = st.world ? st.world.quality : savedQuality();
  document.querySelectorAll("#prQuality button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.q === q)));
}
function setQuality(q) {
  try { localStorage.setItem(QUALITY_KEY, q); } catch (e) { /* ignore */ }
  if (st.world) st.world.setQuality(q, true);
  syncQualityUi();
}

function toggleGroup() {
  const next = st.group === "classic" ? "minecraft" : "classic";
  applyScene(st.scenes[next]);
}

function applyAnim(id, byUser = false) {
  // flying needs an elytra, like in the game
  if (id === "fly" && byUser && !st.equip.elytra) setElytra(true);
  st.anim = id;
  if (byUser) st.motion = true;
  // buttons only look pressed when they really do something
  document.querySelectorAll("#prAnims button").forEach(b => b.setAttribute("aria-pressed", String(st.motion && b.dataset.anim === id)));
  const v = st.viewer;
  if (!v) return;
  const A = st.sv;
  const make = { idle: () => new A.IdleAnimation(), walk: () => new A.WalkingAnimation(), run: () => new A.RunningAnimation(), fly: () => new A.FlyingAnimation() }[id];
  v.animation = st.motion ? make() : null;
  if (v.animation && id === "walk") v.animation.speed = 0.75;
  savePrefs();
}

function applyRotate(on) {
  st.rotate = on;
  $("prRotate").setAttribute("aria-pressed", String(on));
  const v = st.viewer;
  if (v) {
    // in a block world the camera circles the figure so the world stays put; otherwise the figure turns
    const spin = on;
    v.autoRotate = !st.world && spin; v.autoRotateSpeed = 1.1;
    v.controls.autoRotate = !!st.world && spin; v.controls.autoRotateSpeed = 1.6;
  }
  savePrefs();
}

// ---------- pointer: left drag / one finger turns the skin, right drag / two fingers move the camera ----------
function bindSkinDrag(v, THREE) {
  const c = v.controls;
  c.mouseButtons = { LEFT: -1, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  c.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE };
  const canvas = v.canvas, touches = new Set();
  let drag = null;
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "touch") touches.add(e.pointerId);
    if (touches.size > 1) { drag = null; return; } // two fingers: the camera takes over
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    v.playerWrapper.rotation.y += (e.clientX - drag.x) * 0.012;
    drag.x = e.clientX;
  });
  const end = e => { touches.delete(e.pointerId); if (drag && drag.id === e.pointerId) drag = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
}

// ---------- particles ----------
function startFx(mode) {
  const c = $("prFx");
  cancelAnimationFrame(st.fx.raf);
  st.fx.mode = mode;
  const ctx = c.getContext("2d");
  const size = () => { const d = Math.min(2, devicePixelRatio || 1); c.width = c.clientWidth * d; c.height = c.clientHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  size();
  st.fx.size = size;
  if (!mode) { ctx.clearRect(0, 0, c.width, c.height); return; }
  const w = () => c.clientWidth, h = () => c.clientHeight;
  const n = mode === "stars" ? 180 : 90;
  st.fx.parts = Array.from({ length: n }, () => ({
    x: Math.random(), y: Math.random(), s: Math.random() * (mode === "stars" ? 1.8 : 2.4) + .6,
    v: Math.random() * .00025 + .00008, p: Math.random() * 6.28, dx: (Math.random() - .5) * .0002,
  }));
  const draw = time => {
    ctx.clearRect(0, 0, w(), h());
    for (const p of st.fx.parts) {
      if (mode === "stars") {
        const a = .25 + .75 * Math.abs(Math.sin(time / 1300 + p.p));
        ctx.fillStyle = `rgba(220,232,255,${a})`;
        ctx.fillRect(p.x * w(), p.y * h() * .7, p.s, p.s);
        continue;
      }
      p.y -= p.v * 16; p.x += p.dx * 16 + Math.sin(time / 1800 + p.p) * .0002;
      if (p.y < -.02) { p.y = 1.02; p.x = Math.random(); }
      let x = p.x * w(), y = p.y * h(), a;
      if (mode === "dust") {
        // only visible inside the cone of the spotlight
        const cx = w() / 2, spread = (y / h()) * w() * .32 + 40;
        const inBeam = Math.max(0, 1 - Math.abs(x - cx) / spread);
        a = inBeam * (.35 + .5 * Math.abs(Math.sin(time / 900 + p.p)));
        ctx.fillStyle = `rgba(255,240,210,${a})`;
      } else {
        a = .25 + .55 * Math.abs(Math.sin(time / 700 + p.p));
        ctx.fillStyle = `rgba(255,${170 + Math.floor(p.p * 10)},90,${a})`;
      }
      ctx.beginPath(); ctx.arc(x, y, p.s, 0, 6.283); ctx.fill();
    }
    if (!reduce()) st.fx.raf = requestAnimationFrame(draw);
  };
  st.fx.raf = requestAnimationFrame(draw);
}

// ---------- content ----------
function fillInfo(skin) {
  const n = st.list.length;
  $("prCount").textContent = `${String(st.i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
  $("prName").textContent = skin.name;
  $("prMeta").textContent = skin.model === "slim" ? t("modelSlim") : t("modelClassic");
  const big = $("prBig");
  big.replaceChildren(...[0, 1].map(() => { const s = document.createElement("span"); s.textContent = skin.name + " · "; return s; }));
}

async function show(i, dir = 0) {
  if (!st.list.length || st.busy) return;
  st.i = (i + st.list.length) % st.list.length;
  const skin = st.list[st.i];
  const root = $("present");
  if (dir && !reduce()) {
    st.busy = true;
    root.dataset.dir = dir > 0 ? "next" : "prev";
    root.classList.add("pr-leave");
    await new Promise(r => setTimeout(r, 320));
  }
  fillInfo(skin);
  if (st.viewer) {
    try { await st.viewer.loadSkin(skin.data, { model: skin.model === "slim" ? "slim" : "default" }); } catch (e) { /* ignore */ }
    st.viewer.playerObject.rotation.y = 0;
    await applyEquipment();
    if (st.world) st.world.skinChanged();
  }
  root.classList.remove("pr-leave");
  if (dir && !reduce()) {
    root.classList.add("pr-enter");
    void root.offsetWidth;
    requestAnimationFrame(() => root.classList.remove("pr-enter"));
  }
  st.busy = false;
}

// ---------- header + idle chrome ----------
function closeHeader() {
  clearTimeout(st.hdrTimer);
  document.body.classList.remove("hdr-open");
}
function openHeader() {
  document.body.classList.add("hdr-open");
  clearTimeout(st.hdrTimer);
  st.hdrTimer = setTimeout(() => { if (!document.querySelector(".top:hover")) document.body.classList.remove("hdr-open"); else openHeader(); }, 3500);
}
// ---------- hide all controls ----------
function hideUi() {
  st.uiHidden = { t: performance.now(), x: null, y: null };
  togglePanel(false);
  closeHeader();
  $("present").classList.add("ui-hidden");
}
function showUi() {
  if (!st.uiHidden) return;
  st.uiHidden = null;
  $("present").classList.remove("ui-hidden");
  wake();
}

function wake() {
  $("present").classList.remove("idle");
  clearTimeout(st.idleTimer);
  st.idleTimer = setTimeout(() => { if (st.on && !document.querySelector(".pr-controls:hover, .pr-nav:hover")) $("present").classList.add("idle"); }, 2600);
}

// ---------- public ----------
export function presenting() { return st.on; }
/** Read-only look at the presentation state, for automated tests. */
export const presentDebug = () => st;

export async function startPresentation(list, startIndex = 0, onExit) {
  if (!list.length) return;
  prefs();
  st.motion = !reduce();
  if (!st.motion) st.rotate = false; // start still; the rotate button turns it on
  st.list = list; st.on = true; st.onExit = onExit;
  document.body.classList.add("presenting");
  $("present").hidden = false;
  $("presentBtn").setAttribute("aria-pressed", "true");
  st.i = Math.min(startIndex, list.length - 1);
  fillInfo(list[st.i]);
  await initViewer();
  if (!st.on) return;
  $("prFallback").hidden = !!st.viewer;
  if (st.viewer) st.viewer.renderPaused = false;
  st.equip = loadEquipment();
  loadPackTextures().then(applyEquipment);
  applyScene(st.scene);
  applyAnim(st.anim);
  applyRotate(st.rotate);
  show(startIndex);
  wake();
  $("prNext").focus({ preventScroll: true });
}

export function stopPresentation() {
  if (!st.on) return;
  showUi();
  st.on = false;
  cancelAnimationFrame(st.fx.raf);
  if (st.viewer) st.viewer.renderPaused = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  document.body.classList.remove("presenting", "hdr-open");
  $("present").hidden = true;
  $("presentBtn").setAttribute("aria-pressed", "false");
  if (st.onExit) st.onExit();
}

export function setupPresentation() {
  // group switch (Classic | Minecraft), scene buttons of the current group, animations
  $("prGroups").replaceChildren(...GROUPS.map(g => {
    const b = document.createElement("button");
    b.dataset.group = g; b.id = "group-" + g;
    b.innerHTML = `<span data-i18n="group_${g}"></span>`;
    b.addEventListener("click", () => { if (g !== st.group) toggleGroup(); });
    return b;
  }));
  $("prAnims").replaceChildren(...ANIMS.map(a => {
    const b = document.createElement("button");
    b.className = "pr-pill"; b.dataset.anim = a; b.id = "anim-" + a;
    b.innerHTML = `<span data-i18n="anim_${a}"></span>`;
    b.addEventListener("click", () => applyAnim(a, true));
    return b;
  }));
  applyI18n($("present"));
  $("prPrev").addEventListener("click", () => show(st.i - 1, -1));
  $("prNext").addEventListener("click", () => show(st.i + 1, 1));
  $("prClose").addEventListener("click", stopPresentation);
  $("prMenu").addEventListener("click", () => { document.body.classList.contains("hdr-open") ? closeHeader() : openHeader(); });
  $("prRotate").addEventListener("click", () => applyRotate(!st.rotate));
  // the button shows what it will do: enter or leave full screen (also after Esc / F11)
  const syncFull = () => {
    const full = !!document.fullscreenElement, b = $("prFull");
    b.querySelector("use").setAttribute("href", full ? "#i-full-exit" : "#i-full");
    b.dataset.i18nTitle = full ? "fullscreenExit" : "fullscreen";
    b.title = t(b.dataset.i18nTitle); b.setAttribute("aria-label", b.title);
    b.setAttribute("aria-pressed", String(full));
  };
  document.addEventListener("fullscreenchange", syncFull);
  $("prFull").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  const root = $("present");
  addEventListener("resize", () => { if (st.on && st.fx.size) st.fx.size(); });
  root.addEventListener("pointermove", wake);
  // touch screens send no hover moves: any tap brings the controls back
  root.addEventListener("pointerdown", wake, true);
  $("hdrClose").addEventListener("click", closeHeader);
  $("prWorld").addEventListener("click", () => togglePanel());
  $("prEquip").addEventListener("click", () => toggleEquipPanel());
  $("eqElytra").addEventListener("change", e => setElytra(e.target.checked));
  buildArmorUi();
  buildItemsUi();
  document.addEventListener("pointerdown", e => {
    if (!$("prEquipPanel").hidden && !e.target.closest("#prEquipPanel, #prEquip")) toggleEquipPanel(false);
  }, true);
  $("prHideUi").addEventListener("click", e => { e.stopPropagation(); hideUi(); });
  // after hiding, a clear mouse movement (not the click jitter) or a tap brings the controls back
  root.addEventListener("pointermove", e => {
    const h = st.uiHidden;
    if (!h || e.pointerType === "touch") return;
    if (h.x === null) { h.x = e.clientX; h.y = e.clientY; return; }
    if (performance.now() - h.t > 400 && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 40) showUi();
  });
  root.addEventListener("pointerdown", e => { if (st.uiHidden && e.pointerType === "touch") showUi(); }, true);
  $("prQuality").addEventListener("click", e => { const b = e.target.closest("button[data-q]"); if (b) setQuality(b.dataset.q); });
  $("prPackPick").addEventListener("click", () => $("prPackInput").click());
  $("prPackInput").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) choosePack(f); });
  $("prTexSource").addEventListener("change", e => {
    // the file picker must open right inside the user's action, before anything asynchronous
    if (e.target.value === "file") { $("prPackInput").click(); syncPackUi("file"); return; }
    chooseSource(e.target.value);
  });
  document.addEventListener("pointerdown", e => {
    if (!$("prWorldPanel").hidden && !e.target.closest("#prWorldPanel, #prWorld")) togglePanel(false);
  }, true);
  // a click anywhere outside the open header closes it
  document.addEventListener("pointerdown", e => {
    if (st.on && document.body.classList.contains("hdr-open") && !e.target.closest(".top, #prMenu")) closeHeader();
  }, true);
  document.addEventListener("pointermove", e => {
    if (!st.on) return;
    if (e.clientY < 10) { openHeader(); return; }
    // moving clearly away below the open header closes it again (however it was opened)
    if (e.pointerType === "mouse" && document.body.classList.contains("hdr-open")) {
      const bottom = document.querySelector(".top").getBoundingClientRect().bottom;
      if (e.clientY > bottom + 70) closeHeader();
    }
  });
  document.querySelector(".top").addEventListener("pointerenter", () => { if (st.on) clearTimeout(st.hdrTimer); });
  document.querySelector(".top").addEventListener("pointerleave", () => { if (st.on && document.body.classList.contains("hdr-open")) openHeader(); });
  document.addEventListener("keydown", e => {
    if (!st.on || e.target.matches("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show(st.i + 1, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(st.i - 1, -1); }
    else if (e.key === "Escape" && !$("prWorldPanel").hidden) togglePanel(false);
    else if (e.key === "Escape" && !$("prEquipPanel").hidden) toggleEquipPanel(false);
    else if (e.key === "Escape" && document.body.classList.contains("hdr-open")) closeHeader();
    else if (e.key === "Escape" && !document.fullscreenElement) stopPresentation();
    else if (e.key === " ") { e.preventDefault(); applyRotate(!st.rotate); }
    else if (/^[1-4]$/.test(e.key)) applyScene(SCENES[st.group][Number(e.key) - 1].id);
    else if (e.key.toLowerCase() === "g") toggleGroup();
    else if (e.key.toLowerCase() === "m") openHeader();
    else if (e.key.toLowerCase() === "h") { st.uiHidden ? showUi() : hideUi(); return; }
    wake();
  });
  // swipe left/right anywhere except on the figure and the controls
  let sx = null;
  root.addEventListener("pointerdown", e => { if (e.target.closest("canvas, button")) return; sx = e.clientX; });
  root.addEventListener("pointerup", e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 60) dx < 0 ? show(st.i + 1, 1) : show(st.i - 1, -1);
  });
}
