// Presentation mode: one skin at a time, full screen, in a lit scene.
import { t, getLang, applyI18n } from "./i18n.js";

import { $ } from "./dom.js";
const KEY = "skin-library-present";
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const SCENES = [
  { id: "studio", amb: ["#ffffff", 1.0], cam: ["#ffffff", 1.0], fx: null },
  { id: "spotlight", amb: ["#ffffff", 0.5], cam: ["#fff1d6", 2.4], fx: "dust" },
  { id: "sunset", amb: ["#ffb38a", 0.85], cam: ["#ff9a4d", 1.45], fx: "embers" },
  { id: "neon", amb: ["#9ef0ff", 0.95], cam: ["#ff6fe0", 2.0], fx: null },
  { id: "night", amb: ["#9ab8ff", 0.95], cam: ["#e2ecff", 1.6], fx: "stars" },
];
const ANIMS = ["idle", "walk", "run", "fly"];

const st = {
  on: false, list: [], i: 0, viewer: null, base: null, scene: "studio", anim: "idle", rotate: true,
  fx: { raf: 0, parts: [], mode: null }, idleTimer: 0, hdrTimer: 0, busy: false, onExit: null,
};

function prefs() {
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* ignore */ }
  if (!SCENES.some(s => s.id === st.scene)) st.scene = "studio";
  if (!ANIMS.includes(st.anim)) st.anim = "idle";
}
function savePrefs() {
  try { localStorage.setItem(KEY, JSON.stringify({ scene: st.scene, anim: st.anim, rotate: st.rotate })); } catch (e) { /* ignore */ }
}

// ---------- 3D viewer ----------
function initViewer() {
  if (st.viewer || !window.skinview3d) return st.viewer;
  try {
    const v = new skinview3d.SkinViewer({ width: 600, height: 800 });
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
  } catch (e) { st.viewer = null; }
  return st.viewer;
}

function applyScene(id) {
  st.scene = id;
  const sc = SCENES.find(s => s.id === id);
  $("present").dataset.scene = id;
  document.querySelectorAll("#prScenes button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scene === id)));
  const v = st.viewer;
  if (v && st.base) {
    v.globalLight.color.set(sc.amb[0]); v.globalLight.intensity = st.base.amb * sc.amb[1];
    v.cameraLight.color.set(sc.cam[0]); v.cameraLight.intensity = st.base.cam * sc.cam[1];
  }
  startFx(sc.fx);
  savePrefs();
}

function applyAnim(id) {
  st.anim = id;
  document.querySelectorAll("#prAnims button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.anim === id)));
  const v = st.viewer;
  if (!v) return;
  const A = window.skinview3d;
  const make = { idle: () => new A.IdleAnimation(), walk: () => new A.WalkingAnimation(), run: () => new A.RunningAnimation(), fly: () => new A.FlyingAnimation() }[id];
  v.animation = reduce() ? null : make();
  if (v.animation && id === "walk") v.animation.speed = 0.75;
  savePrefs();
}

function applyRotate(on) {
  st.rotate = on;
  $("prRotate").setAttribute("aria-pressed", String(on));
  if (st.viewer) { st.viewer.autoRotate = on && !reduce(); st.viewer.autoRotateSpeed = 1.1; }
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

export function startPresentation(list, startIndex = 0, onExit) {
  if (!list.length) return;
  prefs();
  st.list = list; st.on = true; st.onExit = onExit;
  document.body.classList.add("presenting");
  $("present").hidden = false;
  $("presentBtn").setAttribute("aria-pressed", "true");
  initViewer();
  $("prFallback").hidden = !!st.viewer;
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
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  document.body.classList.remove("presenting", "hdr-open");
  $("present").hidden = true;
  $("presentBtn").setAttribute("aria-pressed", "false");
  if (st.onExit) st.onExit();
}

export function setupPresentation() {
  // scene + animation buttons
  $("prScenes").replaceChildren(...SCENES.map(s => {
    const b = document.createElement("button");
    b.className = "pr-pill"; b.dataset.scene = s.id; b.id = "scene-" + s.id;
    b.innerHTML = `<i class="sw sw-${s.id}"></i><span data-i18n="scene_${s.id}"></span>`;
    b.addEventListener("click", () => applyScene(s.id));
    return b;
  }));
  $("prAnims").replaceChildren(...ANIMS.map(a => {
    const b = document.createElement("button");
    b.className = "pr-pill"; b.dataset.anim = a; b.id = "anim-" + a;
    b.innerHTML = `<span data-i18n="anim_${a}"></span>`;
    b.addEventListener("click", () => applyAnim(a));
    return b;
  }));
  applyI18n($("present"));
  $("prPrev").addEventListener("click", () => show(st.i - 1, -1));
  $("prNext").addEventListener("click", () => show(st.i + 1, 1));
  $("prClose").addEventListener("click", stopPresentation);
  $("prMenu").addEventListener("click", () => { document.body.classList.contains("hdr-open") ? document.body.classList.remove("hdr-open") : openHeader(); });
  $("prRotate").addEventListener("click", () => applyRotate(!st.rotate));
  $("prFull").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  const root = $("present");
  addEventListener("resize", () => { if (st.on && st.fx.size) st.fx.size(); });
  root.addEventListener("pointermove", wake);
  document.addEventListener("pointermove", e => { if (st.on && e.clientY < 10) openHeader(); });
  document.querySelector(".top").addEventListener("pointerenter", () => { if (st.on) clearTimeout(st.hdrTimer); });
  document.querySelector(".top").addEventListener("pointerleave", () => { if (st.on && document.body.classList.contains("hdr-open")) openHeader(); });
  document.addEventListener("keydown", e => {
    if (!st.on || e.target.matches("input, textarea, select") || document.querySelector("dialog[open]")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show(st.i + 1, 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(st.i - 1, -1); }
    else if (e.key === "Escape" && !document.fullscreenElement) stopPresentation();
    else if (e.key === " ") { e.preventDefault(); applyRotate(!st.rotate); }
    else if (/^[1-5]$/.test(e.key)) applyScene(SCENES[Number(e.key) - 1].id);
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
