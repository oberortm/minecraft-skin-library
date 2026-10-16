// Profile picture generator: the head, the upper body or the whole figure of a skin as a PNG,
// flat (pixel art) or rendered in 3D, on a transparent, plain or gradient background.
import { t } from "./i18n.js";
import { $ } from "./dom.js";
import { load3d } from "./view3d.js";
import { loadImage, renderFigure, legacyTo64 } from "./skin.js";
import { saveWithPreview, canvasBlob } from "./saver.js";

const KEY = "skin-library-pfp";
const st = { skin: null, img: null, viewer: null, kit: null, seq: 0, opts: null };
const DEFAULTS = { crop: "head", style: "angle", bg: "gradient", c1: "#7aa2ff", c2: "#c86bff", shape: "round", size: "512" };

function loadOpts() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { return { ...DEFAULTS }; }
}
function saveOpts() { try { localStorage.setItem(KEY, JSON.stringify(st.opts)); } catch (e) { /* ignore */ } }

/** The figure flat from the front (16x32 canvas from skin.js), cropped to the chosen part. */
function flatSource(crop) {
  const fig = document.createElement("canvas");
  renderFigure(fig, st.img, st.skin.model, "front", { legacy: st.skin.fmt === "64x32" });
  if (crop === "head") {
    // straight from the texture: face plus hat layer, slightly larger like in the game
    const c = document.createElement("canvas"); c.width = c.height = 10;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    const tex = st.skin.fmt === "64x32" ? legacyTo64(st.img) : st.img;
    x.drawImage(tex, 8, 8, 8, 8, 1, 1, 8, 8);
    x.drawImage(tex, 40, 8, 8, 8, 0, 0, 10, 10);
    return c;
  }
  if (crop === "bust") {
    const c = document.createElement("canvas"); c.width = 16; c.height = 16;
    c.getContext("2d").drawImage(fig, 0, 0, 16, 16, 0, 0, 16, 16);
    return c;
  }
  return fig;
}

/** Render the figure with skinview3d, framed on the chosen part, into a square canvas. */
async function render3d(size, crop, style) {
  const kit = st.kit || (st.kit = await load3d());
  if (!kit) throw new Error("3d");
  const { sv, THREE } = kit;
  if (!st.viewer) {
    st.viewer = new sv.SkinViewer({ width: size, height: size, preserveDrawingBuffer: true, pixelRatio: 1, renderPaused: true });
    st.viewer.renderPaused = true;
    st.viewer.autoRotate = false;
    st.viewer.animation = null;
  }
  const v = st.viewer;
  if (v.width !== size) v.setSize(size, size);
  if (st.loaded !== st.skin.id + st.skin.updated) {
    await v.loadSkin(st.skin.data, { model: st.skin.model === "slim" ? "slim" : "default" });
    st.loaded = st.skin.id + st.skin.updated;
  }
  const s = v.playerObject.skin;
  // only what is drawn: the head also carries hidden ears and the like
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const boxOf = (obj, into = new THREE.Box3()) => { obj.traverse(o => { if (o.isMesh && shown(o)) into.expandByObject(o); }); return into; };
  v.scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  if (crop === "head") boxOf(s.head, box);
  else if (crop === "bust") {
    for (const part of [s.head, s.body, s.rightArm, s.leftArm]) boxOf(part, box);
    const b = boxOf(s.body);
    box.min.y = b.min.y + (b.max.y - b.min.y) * 0.35;
  }
  else boxOf(s, box);
  const center = box.getCenter(new THREE.Vector3()), dim = box.getSize(new THREE.Vector3());
  const cam = v.camera;
  cam.fov = 24; cam.aspect = 1; cam.updateProjectionMatrix();
  const half = Math.max(dim.x, dim.y) / 2 * ({ head: 1.5, bust: 1.12, full: 1.22 })[crop];
  const dist = half / Math.tan((cam.fov / 2) * Math.PI / 180) + dim.z / 2;
  // a bust ends at the lower edge of the picture
  if (crop === "bust") center.y = box.min.y + half * 0.96;
  const a = style === "angle" ? -0.62 : 0, up = style === "angle" ? 0.18 : 0;
  cam.position.set(center.x + Math.sin(a) * dist, center.y + dist * up, center.z + Math.cos(a) * dist);
  v.controls.minDistance = 0; v.controls.maxDistance = Infinity;
  v.controls.target.copy(center);
  v.controls.update();
  cam.lookAt(center);
  v.render();
  return v.canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Draw the picture with the current options into a new canvas of the chosen size. */
async function compose() {
  const o = st.opts, S = Number(o.size) || 512;
  const out = document.createElement("canvas"); out.width = out.height = S;
  const ctx = out.getContext("2d");
  ctx.save();
  if (o.shape === "round") { ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip(); }
  else if (o.shape === "rounded") { roundRect(ctx, 0, 0, S, S, S * 0.18); ctx.clip(); }
  if (o.bg === "color") { ctx.fillStyle = o.c1; ctx.fillRect(0, 0, S, S); }
  else if (o.bg === "gradient") {
    const g = ctx.createLinearGradient(0, 0, S, S); g.addColorStop(0, o.c1); g.addColorStop(1, o.c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // a soft light behind the figure
    const r = ctx.createRadialGradient(S / 2, S * 0.42, 0, S / 2, S * 0.42, S * 0.6);
    r.addColorStop(0, "rgba(255,255,255,.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = r; ctx.fillRect(0, 0, S, S);
  }
  if (o.style === "flat") {
    const src = flatSource(o.crop), pad = o.shape === "round" ? 0.2 : 0.12;
    const avail = S * (1 - pad * 2), k = Math.floor(avail / Math.max(src.width, src.height)) || avail / Math.max(src.width, src.height);
    const w = src.width * k, h = src.height * k;
    ctx.imageSmoothingEnabled = false;
    // a bust stands on the bottom edge, everything else is centred
    const y = o.crop === "bust" ? S - h : (S - h) / 2;
    ctx.drawImage(src, Math.round((S - w) / 2), Math.round(y), w, h);
  } else {
    const inner = Math.round(S * (o.shape === "round" ? 0.86 : 1));
    const c3 = await render3d(inner, o.crop, o.style);
    const y = o.crop === "bust" ? S - inner : (S - inner) / 2;
    ctx.drawImage(c3, (S - inner) / 2, y + (o.crop === "bust" ? inner * 0.04 : 0));
  }
  ctx.restore();
  return out;
}

async function refresh() {
  const seq = ++st.seq;
  try {
    const c = await compose();
    if (seq !== st.seq) return;
    const p = $("pfpPreview"), x = p.getContext("2d");
    x.clearRect(0, 0, p.width, p.height);
    x.imageSmoothingEnabled = st.opts.style !== "flat";
    x.drawImage(c, 0, 0, p.width, p.height);
    st.last = c;
    $("pfpErr").hidden = true;
  } catch (e) {
    $("pfpErr").hidden = false;
  }
}

function sync() {
  const o = st.opts;
  for (const [id, key] of [["pfpCrop", "crop"], ["pfpStyle", "style"], ["pfpBg", "bg"], ["pfpShape", "shape"]]) {
    $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === o[key])));
  }
  $("pfpC1").value = o.c1; $("pfpC2").value = o.c2; $("pfpSize").value = o.size;
  $("pfpC1").hidden = o.bg === "none"; $("pfpC2").hidden = o.bg !== "gradient";
}

export async function openPfp(skin) {
  st.skin = skin; st.opts = loadOpts();
  st.img = await loadImage(skin.data);
  $("pfpTitle").textContent = t("pfpTitle") + " – " + skin.name;
  sync();
  $("pfp").showModal();
  refresh();
}

function closePfp() {
  if ($("pfp").open) $("pfp").close();
}

export function setupPfp() {
  const d = $("pfp");
  for (const [id, key] of [["pfpCrop", "crop"], ["pfpStyle", "style"], ["pfpBg", "bg"], ["pfpShape", "shape"]]) {
    $(id).addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      st.opts[key] = b.dataset.v; saveOpts(); sync(); refresh();
    });
  }
  for (const [id, key] of [["pfpC1", "c1"], ["pfpC2", "c2"], ["pfpSize", "size"]]) {
    $(id).addEventListener("input", e => { st.opts[key] = e.target.value; saveOpts(); sync(); refresh(); });
  }
  $("pfpClose").addEventListener("click", closePfp);
  d.addEventListener("click", e => { if (e.target === d) closePfp(); });
  d.addEventListener("close", () => {
    // free the WebGL context; the next picture builds a new one
    if (st.viewer) { st.viewer.dispose(); st.viewer = null; st.loaded = null; }
  });
  $("pfpSave").addEventListener("click", () => saveWithPreview({
    title: t("pfpTitle"),
    filename: `${(st.skin.name || "skin").replace(/[^\w\-]+/g, "_")}-${st.opts.crop}-${st.opts.size}.png`,
    make: async progress => {
      progress(0.2);
      const c = await compose();
      progress(0.7);
      const b = await canvasBlob(c);
      progress(1);
      return b;
    },
  }));
}

/** For automated tests. */
export const pfpDebug = () => st;
