// Presentation mode: one skin at a time, full screen, in a lit scene.
import { t, getLang, applyI18n } from "./i18n.js";

import { $ } from "./dom.js";
import { load3d } from "./view3d.js";
const KEY = "skin-library-present";
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Two groups of four moods. Classic scenes are CSS backdrops behind the figure; Minecraft scenes
// are real block worlds built into the 3D scene (js/mcworld.js, loaded on first use).
export const SCENES = {
  classic: [
    { id: "studio", amb: ["#ffffff", 1.0], cam: ["#ffffff", 1.0], fx: null },
    { id: "spotlight", amb: ["#ffffff", 0.5], cam: ["#fff1d6", 2.4], fx: "dust" },
    { id: "sunset", amb: ["#ffb38a", 0.85], cam: ["#ff9a4d", 1.45], fx: "embers" },
    { id: "night", amb: ["#9ab8ff", 0.95], cam: ["#e2ecff", 1.6], fx: "stars" },
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
      st.world = new st.worldMod.McWorld(v);
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

function toggleGroup() {
  const next = st.group === "classic" ? "minecraft" : "classic";
  applyScene(st.scenes[next]);
}

function applyAnim(id, byUser = false) {
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
  $("prMeta").textContent = `${skin.model === "slim" ? t("modelSlim") : t("modelClassic")}   ${t("added")} ${new Date(skin.created).toLocaleDateString(getLang())}`;
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
  applyScene(st.scene);
  applyAnim(st.anim);
  applyRotate(st.rotate);
  show(startIndex);
  wake();
  $("prNext").focus({ preventScroll: true });
}

export function stopPresentation() {
  if (!st.on) return;
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
  // a click anywhere outside the open header closes it
  document.addEventListener("pointerdown", e => {
    if (st.on && document.body.classList.contains("hdr-open") && !e.target.closest(".top, #prMenu")) closeHeader();
  }, true);
  document.addEventListener("pointermove", e => { if (st.on && e.clientY < 10) openHeader(); });
  document.querySelector(".top").addEventListener("pointerenter", () => { if (st.on) clearTimeout(st.hdrTimer); });
  document.querySelector(".top").addEventListener("pointerleave", () => { if (st.on && document.body.classList.contains("hdr-open")) openHeader(); });
  document.addEventListener("keydown", e => {
    if (!st.on || e.target.matches("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show(st.i + 1, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(st.i - 1, -1); }
    else if (e.key === "Escape" && document.body.classList.contains("hdr-open")) closeHeader();
    else if (e.key === "Escape" && !document.fullscreenElement) stopPresentation();
    else if (e.key === " ") { e.preventDefault(); applyRotate(!st.rotate); }
    else if (/^[1-4]$/.test(e.key)) applyScene(SCENES[st.group][Number(e.key) - 1].id);
    else if (e.key.toLowerCase() === "g") toggleGroup();
    else if (e.key.toLowerCase() === "m") openHeader();
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
