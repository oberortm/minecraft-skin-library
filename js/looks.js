// Look (visual theme) handling. Each look has a light and a dark variant in css/looks.css.
// The block textures for the Minecraft look are generated here from noise, no game assets are used.

export const LOOKS = ["mc", "album", "workshop", "gallery", "standard"];
export const DEFAULT_LOOK = "mc";
const KEY = "skin-library-look";

const FONTS = {
  standard: "family=Pixelify+Sans:wght@500;700&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@500",
  mc: "family=Pixelify+Sans:wght@400;500;700&family=Figtree:wght@400;500;600",
  album: "family=Lilita+One&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,800",
  workshop: "family=Kalam:wght@400;700&family=Atkinson+Hyperlegible:wght@400;700",
  gallery: "family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600",
};

export function savedLook() {
  try { const l = localStorage.getItem(KEY); if (LOOKS.includes(l)) return l; } catch (e) { /* ignore */ }
  return DEFAULT_LOOK;
}

function ensureFont(look) {
  const id = "font-" + look;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id; link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?" + FONTS[look] + "&display=swap";
  document.head.appendChild(link);
}

export function applyLook(look) {
  if (!LOOKS.includes(look)) look = DEFAULT_LOOK;
  document.documentElement.dataset.look = look;
  ensureFont(look);
  if (look === "mc") ensureTextures();
  try { localStorage.setItem(KEY, look); } catch (e) { /* ignore */ }
}

// ---------- procedural block textures ----------
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function tile(palette, seed, { px = 4, top = null } = {}) {
  const n = 16, c = document.createElement("canvas");
  c.width = c.height = n * px;
  const ctx = c.getContext("2d"), r = rng(seed);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let pal = palette;
    if (top && y < top.rows + (r() < 0.45 ? 1 : 0)) pal = top.palette;
    ctx.fillStyle = pal[Math.floor(r() * pal.length)];
    ctx.fillRect(x * px, y * px, px, px);
  }
  return c.toDataURL("image/png");
}
let texturesDone = false;
function ensureTextures() {
  if (texturesDone) return;
  texturesDone = true;
  const dirt = ["#7a5236", "#6b4730", "#8a5f3f", "#5d3d28", "#93684a", "#7e5639"];
  const stone = ["#8c8c8c", "#7f7f7f", "#9a9a9a", "#747474", "#868686", "#a3a3a3"];
  const deep = ["#3b3b42", "#34343a", "#45454d", "#2e2e33", "#3f3f46"];
  const night = ["#2a2230", "#241d29", "#30263a", "#1f1925", "#2d2433"];
  const grass = ["#5d9a32", "#4f8a2a", "#6aab3a", "#47802a", "#73b544"];
  const root = document.documentElement.style;
  root.setProperty("--tx-dirt", `url(${tile(dirt, 11)})`);
  root.setProperty("--tx-stone", `url(${tile(stone, 23)})`);
  root.setProperty("--tx-deep", `url(${tile(deep, 37)})`);
  root.setProperty("--tx-night", `url(${tile(night, 41)})`);
  root.setProperty("--tx-grass", `url(${tile(dirt, 53, { top: { rows: 3, palette: grass } })})`);
}
