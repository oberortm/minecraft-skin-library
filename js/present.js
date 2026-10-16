// Presentation mode: one skin at a time, full screen, in a lit scene.
import { t, applyI18n } from "./i18n.js";

import { $ } from "./dom.js";
import { load3d, pixelRatio } from "./view3d.js";
import { loadEquipment, saveEquipment, applyElytra, applyArmor, ARMOR_SLOTS, ARMOR_MATS, TRIM_PATTERNS, TRIM_MATS, applyItems, ITEMS, TOOL_MATS } from "./equipment.js";
import { EMOTES, emoteAnimations } from "./emotes.js";
import { buildFilm, trailer, videoType } from "./cinema.js";
import { saveWithPreview, canvasBlob } from "./saver.js";
import { readPack, packCanvases, savePack, loadPack, clearPack, SOURCES, downloadSource, selectedSource, selectSource, packStale, downloadable } from "./pack.js";
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
  minecraft: [{ id: "mc-white" }, { id: "mc-dark" }, { id: "mc-sunrise" }, { id: "mc-night" }, { id: "mc-nether" }, { id: "mc-end" }, { id: "mc-ocean" }, { id: "mc-snow" }],
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
  if (ANIMS.includes(saved.anim) || EMOTES.includes(saved.anim)) st.anim = saved.anim;
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
    const v = new kit.sv.SkinViewer({ width: 600, height: 800, pixelRatio: pixelRatio() });
    $("prStage").appendChild(v.canvas);
    v.zoom = 0.66;
    v.fov = 38;
    st.base = { amb: v.globalLight.intensity, cam: v.cameraLight.intensity };
    st.syncSize = () => {
      const r = $("prStage").getBoundingClientRect();
      if (!r.width) return;
      if (r.width === v.width && r.height === v.height) return;
      v.setSize(r.width, r.height);
      // classic: keep the whole figure (and a group) in view on tall, narrow screens. A block world keeps
      // its camera: skinview3d's zoom would move it towards the world origin, sometimes into the hills
      if (!st.world) fitGroupCamera();
      // draw at once, so the canvas is never shown stretched to the new size
      v.render();
    };
    new ResizeObserver(() => st.syncSize()).observe($("prStage"));
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
    syncGroupLook();
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
    unfitCamera();
    st.world.setLook(id);
    st.world.setWeather(savedWeather());
    st.camBase = null; st.camFactor = 1;
    syncGroupLook();
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
      for (const f of st.groupFigs || []) dressGroupFig(f, kit.THREE);
    }
  } catch (e) { console.error("[skin-library] equipment failed:", e); }
  if (st.world) st.world.skinChanged();
  syncGroupColors();
}
/** A group figure wears what the main figure wears: elytra (shared texture), armour and items. */
function dressGroupFig(f, THREE) {
  const v = st.viewer, fake = { playerObject: f.po };
  const elytra = (st.equip.elytra || st.cineElytra) && v.capeTexture;
  if (elytra) { f.po.elytra.map = v.capeTexture; f.po.backEquipment = "elytra"; } else f.po.backEquipment = null;
  applyArmor(fake, THREE, st.equip.armor, st.packTex);
  applyItems(fake, THREE, st.equip.hands, st.packTex);
}
/** Armour and item textures of group figures follow the colour handling of the scene, like the main one's. */
function syncGroupColors() {
  const T = st.groupTHREE;
  if (!T) return;
  for (const f of st.groupFigs || []) f.po.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = !!st.world && o.material.blending === T.NormalBlending;
    const m = o.material.map;
    if (m && m.userData.equipment) { m.colorSpace = st.world ? T.SRGBColorSpace : T.NoColorSpace; m.needsUpdate = true; }
  });
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
  st.flyAuto = null;   // changed by hand: keep it as chosen
  st.equip.elytra = on;
  // the elytra takes the chestplate's place
  if (on) st.equip.armor.chest.mat = null;
  saveEquipment(st.equip);
  syncEquipUi();
  if (!on && st.anim === "fly") applyAnim("idle", true);
  applyEquipment();
}
function toggleEquipPanel(open = $("prEquipPanel").hidden) {
  if (open) { togglePanel(false); closeExtraPanels(); }
  $("prEquipPanel").hidden = !open;
  $("prEquip").setAttribute("aria-expanded", String(open));
  if (open) syncEquipUi();
}
/**
 * Load the textures of the selected source (Minecraft's own by default). A downloadable source that
 * is not stored yet, or stored by an older version without the item textures, is downloaded first,
 * with a small progress badge. When that fails, our own drawings are used and the panel says why.
 */
async function ensureTextures(force = false) {
  const seq = st.packSeq = (st.packSeq || 0) + 1;
  const id = await selectedSource();
  let pack = id === "builtin" ? null : await loadPack(id);
  st.packFailed = st.packFailed || {};
  if (downloadable(id) && (force || packStale(pack)) && (force || !st.packFailed[id])) {
    progress(0);
    try {
      pack = await downloadSource(id, progress);
      await savePack(id, pack);
      st.packMsg = [t("texLoaded", { name: pack.name }), false];
    } catch (e) {
      st.packFailed[id] = true;
      // keep an older stored copy if there is one; else our drawings
      st.packMsg = [t(pack ? "texFailedOld" : "texFallback"), true, SOURCES.find(s => s.id === id).page];
    }
    progress(null);
  }
  if (seq !== st.packSeq) return st.packTex;
  st.packTex = pack ? await packCanvases(pack) : null;
  if (st.world) st.world.setPack(st.packTex);
  applyEquipment();
  if (!$("prWorldPanel").hidden) syncPackUi(id, pack);
  return st.packTex;
}
async function loadPackTextures() { return ensureTextures(); }

// ---------- texture source: Minecraft (default), three packs, own file, our own drawings ----------
async function applySavedPack() { await ensureTextures(); }
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
  $("prPackReload").hidden = !downloadable(id);
  if (id === "file") {
    pack = pack || await loadPack("file");
    $("prPackName").textContent = pack ? pack.name : "";
  }
  if (st.packMsg) { setHint(...st.packMsg); st.packMsg = null; return; }
  setHint(id === "builtin" ? t("texBuiltinHint") : id === "file" ? t("packHint") : id === "vanilla" ? t("texVanillaHint") : t("texDownloadHint"));
}
/** Progress 0..1 (-1 unknown) in the panel and in a small badge that is visible with the panel closed. */
function progress(p) {
  const busy = p !== null;
  $("prPackProgress").hidden = !busy; $("prTexBadge").hidden = !busy;
  $("prTexSource").disabled = busy; $("prPackReload").disabled = busy;
  if (!busy) return;
  const pct = p < 0 ? "…" : Math.round(p * 100) + " %";
  if (p < 0) $("prPackBar").removeAttribute("value"); else $("prPackBar").value = p;
  $("prPackPct").textContent = pct;
  $("prTexBadgePct").textContent = pct;
}
async function chooseSource(id) {
  selectSource(id);
  if (st.packFailed) st.packFailed[id] = false;   // choosing it again is a new try
  st.packMsg = null;
  await ensureTextures();
  syncPackUi(id);
}
async function reloadSource() {
  const id = await selectedSource();
  if (!downloadable(id)) return;
  st.packMsg = null;
  await ensureTextures(true);
  syncPackUi(id);
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
  if (open) { toggleEquipPanel(false); closeExtraPanels(); }
  $("prWorldPanel").hidden = !open;
  $("prWorld").setAttribute("aria-expanded", String(open));
  if (open) {
    $("prWeather").value = savedWeather();
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
  if (id === "fly" && byUser && !st.equip.elytra) {
    const chest = { ...st.equip.armor.chest };
    setElytra(true);
    st.flyAuto = { chest };
  } else if (id !== "fly" && st.flyAuto) {
    // flying put the elytra on: landing takes it off and puts back what was worn before
    const { chest } = st.flyAuto;
    st.flyAuto = null;
    st.equip.elytra = false; st.equip.armor.chest = chest;
    saveEquipment(st.equip); syncEquipUi(); applyEquipment();
  }
  st.anim = id;
  if (byUser) st.motion = true;
  // buttons only look pressed when they really do something
  document.querySelectorAll("#prAnims button[data-anim]").forEach(b => b.setAttribute("aria-pressed", String(st.motion && b.dataset.anim === id)));
  syncEmoteBtn();
  const v = st.viewer;
  if (!v) return;
  v.animation = null;
  resetPose(v.playerObject);
  v.animation = st.motion ? makeAnim(id) : null;
  for (const g of st.groupFigs || []) { resetPose(g.po); g.anim = st.motion ? makeAnim(id, g.phase) : null; }
  savePrefs();
}

/** A fresh animation of this kind; phase shifts it so group figures do not move in lockstep. */
function makeAnim(id, phase = 0) {
  const A = st.sv;
  const E = st.emoteClasses || (st.emoteClasses = emoteAnimations(A));
  const a = E[id] ? new E[id]() : new ({ idle: A.IdleAnimation, walk: A.WalkingAnimation, run: A.RunningAnimation, fly: A.FlyingAnimation }[id] || A.IdleAnimation)();
  if (id === "walk") a.speed = 0.75;
  a.progress = phase;
  return a;
}
/** Back to the plain standing pose: emotes also move and turn whole body parts. */
function resetPose(po) {
  po.resetJoints();
  po.position.set(0, 0, 0); po.rotation.set(0, 0, 0);
  const sk = po.skin;
  if (!sk.userData.rest) sk.userData.rest = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"].map(k => [k, sk[k].position.clone()]);
  for (const [k, pos] of sk.userData.rest) { sk[k].position.copy(pos); sk[k].rotation.set(0, 0, 0); }
}
function syncEmoteBtn() {
  const b = $("prEmoteBtn");
  if (!b) return;
  const on = st.motion && EMOTES.includes(st.anim);
  b.setAttribute("aria-pressed", String(on));
  b.querySelector("span").textContent = on ? t("emote_" + st.anim) : t("emotes");
  document.querySelectorAll("#prEmotes button").forEach(x => x.setAttribute("aria-pressed", String(on && x.dataset.anim === st.anim)));
}
function toggleEmotes(open = $("prEmotes").hidden) {
  if (open) { togglePanel(false); toggleEquipPanel(false); closeExtraPanels(); }
  $("prEmotes").hidden = !open;
  $("prEmoteBtn").setAttribute("aria-expanded", String(open));
}
function closeExtraPanels() {
  for (const [panel, btn] of [["prPhotoPanel", "prPhoto"], ["prGroupPanel", "prGroupBtn"], ["prEmotes", "prEmoteBtn"], ["prCinePanel", "prCineBtn"]]) {
    if ($(panel)) $(panel).hidden = true;
    if ($(btn)) $(btn).setAttribute("aria-expanded", "false");
  }
}
function toggleExtra(panel, btn, open = $(panel).hidden) {
  togglePanel(false); toggleEquipPanel(false); closeExtraPanels();
  $(panel).hidden = !open;
  $(btn).setAttribute("aria-expanded", String(open));
  if (open && panel === "prGroupPanel") renderGroupList();
  if (open && panel === "prPhotoPanel") syncPhotoUi();
}

// ---------- cinema: build film and trailer, optionally recorded ----------
async function startCine(kind) {
  const v = st.viewer, kit = await load3d();
  if (!v || !kit || st.cine) return;
  closeExtraPanels(); togglePanel(false); toggleEquipPanel(false); closeHeader();
  const record = $("cineRecord").checked ? videoType() : null;
  const saved = {
    scene: st.scene, anim: st.anim, rotate: st.rotate, motion: st.motion, group: st.groupOn,
    cam: v.camera.position.clone(), target: v.controls.target.clone(),
    min: v.controls.minDistance, max: v.controls.maxDistance,
  };
  if (st.groupOn) setGroupOn(false);
  $("present").classList.add("cine");
  v.autoRotate = false; v.controls.autoRotate = false;
  v.controls.enabled = false; v.controls.minDistance = 0; v.controls.maxDistance = Infinity;
  v.playerWrapper.rotation.y = 0;
  const free = () => { if (st.world) { st.world.freeCamera = true; st.world.wantDist = null; } };
  free();
  let done = false;
  const host = {
    viewer: v, THREE: kit.THREE, overlay: $("prCine"), skin: st.list[st.i],
    scene: async id => { await applyScene(id); free(); },
    sceneNow: id => { applyScene(id).then(free); },
    anim: (id, speed = 1) => {
      v.animation = null; resetPose(v.playerObject);
      if (id) { v.animation = makeAnim(id); v.animation.speed = speed; }
    },
    elytra: on => {
      if (on) { st.cineElytra = true; applyElytra(v, true, st.packTex).catch(() => {}); }
      else if (st.cineElytra) { st.cineElytra = false; applyEquipment(); }
    },
    world: () => st.world,
    started: c => { st.cineObj = c; },
    done: async recorded => {
      if (done) return;
      done = true;
      st.cine = null; st.cineObj = null;
      if (st.world) st.world.freeCamera = false;
      $("present").classList.remove("cine");
      v.controls.enabled = true;
      await applyScene(saved.scene);
      if (st.world) st.world.freeCamera = false;
      v.controls.minDistance = saved.min; v.controls.maxDistance = saved.max;
      v.controls.target.copy(saved.target); v.camera.position.copy(saved.cam);
      if (st.world) st.world.wantDist = saved.cam.distanceTo(saved.target);
      v.controls.update();
      st.motion = saved.motion;
      applyAnim(saved.anim);
      applyRotate(saved.rotate);
      await applyEquipment();
      if (saved.group) setGroupOn(true);
      wake();
      // the recorded film: preview and save
      if (recorded) saveWithPreview({ title: t("saveVideo"), filename: recorded.filename, make: async () => recorded.blob });
    },
  };
  st.cine = true;
  const film = kind === "build" ? buildFilm(host, record) : trailer(host, record);
  film.catch(e => { console.error("[skin-library] cinema failed:", e); host.done(); });
}
function stopCine() {
  if (st.cineObj) st.cineObj.stop();
}

// ---------- weather (block worlds outdoors) ----------
const WEATHER_KEY = "skin-library-mc-weather";
const savedWeather = () => { try { const w = localStorage.getItem(WEATHER_KEY); return ["clear", "rain", "snow", "fireflies", "leaves"].includes(w) ? w : "clear"; } catch (e) { return "clear"; } };
function setWeather(w) {
  try { localStorage.setItem(WEATHER_KEY, w); } catch (e) { /* ignore */ }
  if (st.world) st.world.setWeather(w);
}

// ---------- photo ----------
const PHOTO_KEY = "skin-library-photo";
function photoPrefs() { try { return { bg: "scene", size: "2", ...JSON.parse(localStorage.getItem(PHOTO_KEY) || "{}") }; } catch (e) { return { bg: "scene", size: "2" }; } }
function syncPhotoUi() {
  const p = photoPrefs(), mc = st.group === "minecraft";
  document.querySelectorAll("#prPhotoBg button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.v === (mc ? "scene" : p.bg))); b.disabled = mc && b.dataset.v === "clear"; });
  document.querySelectorAll("#prPhotoSize button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === p.size)));
}
function setPhotoPref(k, v) {
  const p = photoPrefs(); p[k] = v;
  try { localStorage.setItem(PHOTO_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  syncPhotoUi();
}
/** The classic backdrops are CSS; for a photo they are painted again on the canvas. */
function paintClassicBg(ctx, w, h) {
  const g = (stops, lin) => {
    const gr = lin ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createRadialGradient(w / 2, h * stops.cy, 0, w / 2, h * stops.cy, Math.max(w, h) * stops.r);
    for (const [o, c] of stops.c) gr.addColorStop(o, c);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  };
  const id = st.scene;
  if (id === "studio") g({ cy: 0.38, r: 0.62, c: [[0, "#ffffff"], [0.5, "#eceef2"], [1, "#cdd1d8"]] });
  else if (id === "spotlight") g({ cy: 1, r: 0.6, c: [[0, "#17140f"], [0.7, "#050506"], [1, "#050506"]] });
  else if (id === "sunset") g({ c: [[0, "#23173f"], [0.3, "#6b2f63"], [0.55, "#d0583f"], [0.66, "#f6a356"], [0.662, "#2c1a26"], [1, "#170e15"]] }, true);
  else g({ c: [[0, "#02060f"], [0.55, "#08142e"], [1, "#10244a"]] }, true);
  // sun / moon discs and the particle layer, where they are shown
  const rect = $("present").getBoundingClientRect(), k = w / rect.width;
  for (const sel of [".pr-sun", ".pr-moon", ".pr-beam"]) {
    const el = document.querySelector(sel);
    if (!el || getComputedStyle(el).opacity < 0.05) continue;
    const r = el.getBoundingClientRect(), cx = (r.left + r.width / 2 - rect.left) * k, cy = (r.top + r.height / 2 - rect.top) * k, rad = r.width / 2 * k;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    if (sel === ".pr-sun") { gr.addColorStop(0, "#fff1c9"); gr.addColorStop(0.35, "#ffcf7a"); gr.addColorStop(0.6, "#ff9a4d"); gr.addColorStop(0.72, "rgba(255,120,60,0)"); }
    else if (sel === ".pr-moon") { gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.55, "#dbe6ff"); gr.addColorStop(0.98, "#b9cbf5"); gr.addColorStop(1, "rgba(185,203,245,0)"); }
    else continue;
    ctx.save();
    if (sel === ".pr-sun") { ctx.beginPath(); ctx.rect(0, 0, w, cy); ctx.clip(); }   // the sun sits on the horizon
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  const fx = $("prFx");
  if (fx.width) ctx.drawImage(fx, 0, 0, w, h);
}
/** Render the scene once at a higher resolution; the save window shows progress and a preview. */
async function takePhoto() {
  const v = st.viewer;
  if (!v) return;
  const skin = st.list[st.i];
  // a short flash as feedback
  const f = document.querySelector(".pr-flash");
  if (f && !reduce()) { f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); setTimeout(() => f.classList.remove("on"), 450); }
  await saveWithPreview({
    title: t("savePhoto"),
    filename: `${(skin ? skin.name : "skin").replace(/[^\w\-]+/g, "_")}-${st.scene}.png`,
    make: async progress => {
      const p = photoPrefs(), mc = !!st.world, clear = !mc && p.bg === "clear";
      const r = v.renderer, pr0 = r.getPixelRatio();
      const css = v.canvas.getBoundingClientRect();
      // stay within what the GPU can hold
      const maxTex = Math.min(8192, r.capabilities.maxTextureSize || 4096);
      const scale = Math.min(Number(p.size) || 1, maxTex / (Math.max(css.width, css.height) * pr0));
      const out = document.createElement("canvas");
      progress(0.15);
      try {
        r.setPixelRatio(pr0 * scale); v.updateComposerSize();
        v.render();
        out.width = v.canvas.width; out.height = v.canvas.height;
        const ctx = out.getContext("2d");
        if (!mc && !clear) paintClassicBg(ctx, out.width, out.height);
        ctx.drawImage(v.canvas, 0, 0);   // right after rendering, before the frame is handed to the screen
      } finally {
        r.setPixelRatio(pr0); v.updateComposerSize(); v.render();
      }
      progress(0.6);
      const blob = await canvasBlob(out);
      progress(1);
      return blob;
    },
  });
}

// ---------- group photo: up to four more skins beside the figure ----------
const GROUP_MAX = 4;
function renderGroupList() {
  const others = st.list.filter((s, i) => i !== st.i);
  if (!st.groupSel) st.groupSel = others.slice(0, 3).map(s => s.id);
  $("grpOn").checked = !!st.groupOn;
  $("grpList").replaceChildren(...others.map(s => {
    const l = document.createElement("label");
    l.className = "pr-check";
    l.innerHTML = `<input type="checkbox"> <canvas width="16" height="32"></canvas> <span></span>`;
    l.querySelector("span").textContent = s.name;
    const cb = l.querySelector("input");
    cb.checked = st.groupSel.includes(s.id);
    cb.disabled = !cb.checked && st.groupSel.length >= GROUP_MAX;
    cb.addEventListener("change", () => {
      st.groupSel = cb.checked ? [...st.groupSel, s.id] : st.groupSel.filter(x => x !== s.id);
      renderGroupList();
      if (st.groupOn) buildGroup();
    });
    import("./skin.js").then(({ loadImage, renderFigure }) => loadImage(s.data).then(img => renderFigure(l.querySelector("canvas"), img, s.model, "front", { legacy: s.fmt === "64x32" })));
    return l;
  }));
  if (!others.length) $("grpList").textContent = t("groupNone");
}
function clearGroup() {
  for (const g of st.groupFigs || []) {
    if (g.holder && g.holder.parent) g.holder.parent.remove(g.holder);
    // free the armour and item meshes too
    if (st.groupTHREE) { applyArmor({ playerObject: g.po }, st.groupTHREE, {}, null); applyItems({ playerObject: g.po }, st.groupTHREE, {}, null); }
    g.tex.dispose();
  }
  st.groupFigs = [];
  cancelAnimationFrame(st.groupRaf); st.groupRaf = 0;
  fitGroupCamera();
}
async function buildGroup() {
  const v = st.viewer, kit = await load3d();
  if (!v || !kit) return;
  const seq = st.groupSeq = (st.groupSeq || 0) + 1;
  clearGroup();
  const { THREE, sv } = kit;
  st.groupTHREE = THREE;
  const { loadSkinToCanvas } = await import("skinview-utils");
  const { loadImage } = await import("./skin.js");
  const chosen = st.groupSel.map(id => st.list.find(s => s.id === id)).filter(Boolean).slice(0, GROUP_MAX);
  // left, right, then further out, a little behind
  const slots = [[-17, -3], [17, -3], [-34, -9], [34, -9]];
  const figs = [];
  for (const [i, s] of chosen.entries()) {
    const img = await loadImage(s.data);
    if (seq !== st.groupSeq) return;
    const c = document.createElement("canvas");
    loadSkinToCanvas(c, img);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = st.world ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const po = new sv.PlayerObject();
    po.skin.map = tex;
    po.skin.modelType = s.model === "slim" ? "slim" : "default";
    po.backEquipment = null; if (po.ears) po.ears.visible = false;
    po.position.set(0, 0, 0);
    const holder = new THREE.Group();
    holder.position.set(slots[i][0], 0, slots[i][1]);
    holder.rotation.y = -Math.sign(slots[i][0]) * 0.18;   // turned a little towards the middle
    holder.add(po);
    po.traverse(o => { if (o.isMesh) { o.castShadow = !!st.world; } });
    v.playerWrapper.add(holder);
    figs.push({ po: po, holder, tex, phase: 0.37 * (i + 1), anim: st.motion ? makeAnim(st.anim, 0.37 * (i + 1)) : null, model: s.model });
  }
  st.groupFigs = figs;
  for (const f of figs) dressGroupFig(f, THREE);
  syncGroupColors();
  let last = performance.now();
  const loop = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const f of st.groupFigs) if (f.anim) f.anim.update(f.po, dt);
    st.groupRaf = requestAnimationFrame(loop);
  };
  st.groupRaf = requestAnimationFrame(loop);
  fitGroupCamera();
}
/** Undo the group's step back before a block world places its camera again. */
function unfitCamera() {
  const v = st.viewer;
  if (!v || !st.world || !st.camBase || (st.camFactor || 1) === 1) return;
  const c = v.camera, tg = v.controls.target;
  c.position.copy(tg).add(c.position.clone().sub(tg).normalize().multiplyScalar(st.camBase));
  st.world.wantDist = st.camBase;
  st.camFactor = 1;
}
/** Group figures follow the colour handling and shadows of the current scene. */
function syncGroupLook() {
  const kitTHREE = st.groupTHREE;
  for (const f of st.groupFigs || []) {
    if (kitTHREE) f.tex.colorSpace = st.world ? kitTHREE.SRGBColorSpace : kitTHREE.NoColorSpace;
    f.tex.needsUpdate = true;
  }
  syncGroupColors();
  fitGroupCamera();
}
/** Step the camera back so the whole group fits; back to normal without one. */
function fitGroupCamera() {
  const v = st.viewer;
  if (!v) return;
  const n = (st.groupFigs || []).length, f = n ? (n <= 2 ? 1.75 : 2.6) : 1;
  const w = v.playerWrapper;
  if (!st.world) {
    const r = $("prStage").getBoundingClientRect();
    v.zoom = r.width ? Math.min(0.66, 0.66 * (r.width / r.height) / 0.95) : 0.66;
    // the classic backdrops have a fixed floor: shrink the group around the feet so everyone stands on it
    const s = 1 / f;
    w.scale.setScalar(s); w.position.y = -16 * (1 - s);
    return;
  }
  w.scale.setScalar(1); w.position.y = 0;
  const c = v.camera, tg = v.controls.target, d = c.position.clone().sub(tg);
  const cur = st.world.wantDist || d.length();
  if (!st.camBase) st.camBase = cur / (st.camFactor || 1);
  st.camFactor = f;
  const want = st.camBase * f;
  v.controls.maxDistance = Math.max(v.controls.maxDistance, want + 10);
  st.world.wantDist = want;
  c.position.copy(tg).add(d.normalize().multiplyScalar(want));
  v.controls.update();
}
function setGroupOn(on) {
  st.groupOn = on;
  $("grpOn").checked = on;
  $("prGroupBtn").classList.toggle("on", on);
  if (on) buildGroup(); else { st.groupSeq = (st.groupSeq || 0) + 1; clearGroup(); }
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
  syncFavStar(skin);
  const big = $("prBig");
  big.replaceChildren(...[0, 1].map(() => { const s = document.createElement("span"); s.textContent = skin.name + " · "; return s; }));
}

/** The star next to the name: filled for favourites. */
function syncFavStar(skin) {
  const b = $("prFav");
  b.hidden = !st.onFav;
  b.setAttribute("aria-pressed", String(!!skin.fav));
  b.querySelector("use").setAttribute("href", skin.fav ? "#i-star" : "#i-star-o");
  b.dataset.i18nTitle = skin.fav ? "unfav" : "fav";
  b.title = t(b.dataset.i18nTitle); b.setAttribute("aria-label", b.title);
}
async function toggleFav() {
  const skin = st.list[st.i];
  if (!skin || !st.onFav) return;
  await st.onFav(skin);
  syncFavStar(skin);
  const b = $("prFav");
  if (!reduce()) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
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

export async function startPresentation(list, startIndex = 0, onExit, onFav = null) {
  st.onFav = onFav;
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
  if (st.cineObj) st.cineObj.stop();
  st.on = false;
  if (st.groupOn) setGroupOn(false);
  closeExtraPanels();
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
    b.addEventListener("click", () => { applyAnim(a, true); toggleEmotes(false); });
    return b;
  }));
  // emotes: one pill that opens the list and then shows the chosen emote
  const eb = document.createElement("button");
  eb.className = "pr-pill"; eb.id = "prEmoteBtn"; eb.setAttribute("aria-expanded", "false"); eb.setAttribute("aria-controls", "prEmotes");
  eb.innerHTML = `<span data-i18n="emotes"></span> <svg class="ic sm"><use href="#i-more"/></svg>`;
  eb.addEventListener("click", () => toggleEmotes());
  $("prAnims").appendChild(eb);
  $("prEmotes").replaceChildren(...EMOTES.map(a => {
    const b = document.createElement("button");
    b.className = "pr-pill"; b.dataset.anim = a; b.id = "emote-" + a;
    b.innerHTML = `<span data-i18n="emote_${a}"></span>`;
    b.addEventListener("click", () => { applyAnim(a, true); toggleEmotes(false); });
    return b;
  }));
  $("prPhoto").addEventListener("click", () => toggleExtra("prPhotoPanel", "prPhoto"));
  $("prFav").addEventListener("click", toggleFav);
  $("prCineBtn").addEventListener("click", () => {
    toggleExtra("prCinePanel", "prCineBtn");
    const ok = !!videoType();
    $("cineRecord").disabled = !ok; $("cineNoVideo").hidden = ok;
  });
  $("cineBuild").addEventListener("click", () => startCine("build"));
  $("cineTrailer").addEventListener("click", () => startCine("trailer"));
  // a click or Esc ends a running film
  $("present").addEventListener("pointerdown", e => { if (st.cine && st.cineObj) { e.stopPropagation(); stopCine(); } }, true);
  $("prGroupBtn").addEventListener("click", () => toggleExtra("prGroupPanel", "prGroupBtn"));
  $("prPhotoBg").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b && !b.disabled) setPhotoPref("bg", b.dataset.v); });
  $("prPhotoSize").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (b) setPhotoPref("size", b.dataset.v); });
  $("prPhotoSave").addEventListener("click", () => takePhoto());
  $("grpOn").addEventListener("change", e => setGroupOn(e.target.checked));
  $("prWeather").addEventListener("change", e => setWeather(e.target.value));
  document.addEventListener("pointerdown", e => {
    if (!st.on) return;
    for (const [panel, btn] of [["prPhotoPanel", "prPhoto"], ["prGroupPanel", "prGroupBtn"], ["prEmotes", "prEmoteBtn"], ["prCinePanel", "prCineBtn"]]) {
      if (!$(panel).hidden && !e.target.closest(`#${panel}, #${btn}`)) { $(panel).hidden = true; $(btn).setAttribute("aria-expanded", "false"); }
    }
  }, true);
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
  document.addEventListener("fullscreenchange", () => {
    syncFull();
    // the browser resizes in steps while switching: measure again until it settles
    if (st.syncSize) for (const ms of [0, 60, 200, 500]) setTimeout(() => st.syncSize && st.syncSize(), ms);
  });
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
  $("prPackReload").addEventListener("click", reloadSource);
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
    // the header only comes down after the mouse has rested at the top edge for a moment
    if (e.clientY < 10) {
      if (!document.body.classList.contains("hdr-open") && !st.hdrWait) st.hdrWait = setTimeout(() => { st.hdrWait = 0; openHeader(); }, 800);
      return;
    }
    if (st.hdrWait) { clearTimeout(st.hdrWait); st.hdrWait = 0; }
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
    // while a film runs, only Esc (end it) does something
    if (st.cine) { if (e.key === "Escape") { e.preventDefault(); stopCine(); } return; }
    if (e.key === "ArrowRight") { e.preventDefault(); show(st.i + 1, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(st.i - 1, -1); }
    else if (e.key === "Escape" && st.cine) stopCine();
    else if (e.key === "Escape" && !$("prWorldPanel").hidden) togglePanel(false);
    else if (e.key === "Escape" && !$("prEquipPanel").hidden) toggleEquipPanel(false);
    else if (e.key === "Escape" && ["prPhotoPanel", "prGroupPanel", "prEmotes"].some(id => !$(id).hidden)) closeExtraPanels();
    else if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) takePhoto();
    else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) toggleFav();
    else if (e.key === "Escape" && document.body.classList.contains("hdr-open")) closeHeader();
    else if (e.key === "Escape" && !document.fullscreenElement) stopPresentation();
    else if (e.key === " ") { e.preventDefault(); applyRotate(!st.rotate); }
    else if (/^[1-8]$/.test(e.key) && SCENES[st.group][Number(e.key) - 1]) applyScene(SCENES[st.group][Number(e.key) - 1].id);
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
