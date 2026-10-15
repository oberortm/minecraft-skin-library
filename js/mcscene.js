// Blocky landscape behind the Minecraft look. Generated from noise, drawn in big pixel blocks.
// Day in light mode, night with stars in dark mode. Layers drift with scroll (parallax).

let canvas = null, raf = 0, running = false, staticBound = false, clouds = [], stars = [], layers = null, lastW = 0, lastH = 0;
const B = 16; // block size in CSS px

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function noise1d(seed, n, smooth) {
  const r = rng(seed), raw = Array.from({ length: n + 8 }, () => r());
  return Array.from({ length: n }, (_, i) => {
    let s = 0; for (let k = 0; k < smooth; k++) s += raw[i + k]; return s / smooth;
  });
}

const dark = () => {
  const d = document.documentElement;
  if (d.dataset.theme === "dark") return true;
  if (d.dataset.theme === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
};

function buildLayers(cols) {
  // heights in blocks, measured up from the bottom of the layer
  return {
    far: noise1d(7, cols, 9).map(v => Math.round(4 + v * 10)),
    mid: noise1d(19, cols, 6).map(v => Math.round(3 + v * 7)),
    near: noise1d(31, cols, 4).map(v => Math.round(3 + v * 4)),
    trees: (() => { const r = rng(43); return Array.from({ length: cols }, () => r() < 0.07); })(),
    ores: (() => { const r = rng(59); return Array.from({ length: cols * 6 }, () => r()); })(),
  };
}

function palette(night) {
  return night ? {
    sky: ["#070b1f", "#141c45", "#26306b"], far: "#1a2440", farTop: "#22305a",
    mid: "#14301f", midTop: "#1d4a2a", dirt: "#2b1f17", stone: "#2a2b31", stone2: "#24252a",
    grass: "#1f5a26", grass2: "#256b2e", leaf: "#123a1a", log: "#3a2a1a", cloud: "rgba(200,210,255,.10)", sun: "#e9ecf5",
    ore: ["#4fd1c5", "#e0c35a", "#5a7bd8"],
  } : {
    sky: ["#5aa7ea", "#8cc8f5", "#cfe8ff"], far: "#86a9c9", farTop: "#9cbcd8",
    mid: "#5d9a46", midTop: "#73b354", dirt: "#79553a", stone: "#7c7d82", stone2: "#6f7075",
    grass: "#5ea640", grass2: "#6dbb4b", leaf: "#3f8a2e", log: "#6b4a2f", cloud: "rgba(255,255,255,.92)", sun: "#fff4b0",
    ore: ["#4fd1c5", "#e0c35a", "#5a7bd8"],
  };
}

function draw(t) {
  const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (w !== lastW || h !== lastH) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); lastW = w; lastH = h;
    layers = buildLayers(Math.ceil(w / B) + 40);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const night = dark(), p = palette(night);
  const scroll = window.scrollY || 0;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, p.sky[0]); g.addColorStop(.55, p.sky[1]); g.addColorStop(1, p.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // stars + sun/moon
  if (night) {
    for (const s of stars) {
      const a = .35 + .65 * Math.abs(Math.sin(t / 1400 + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(Math.floor(s.x * w), Math.floor(s.y * h * .6), s.s, s.s);
    }
  }
  const sunX = w * .78, sunY = h * .16 - scroll * .05;
  ctx.fillStyle = p.sun; ctx.fillRect(Math.round(sunX), Math.round(sunY), B * 4, B * 4);
  if (night) { ctx.fillStyle = "rgba(0,0,20,.18)"; ctx.fillRect(Math.round(sunX) + B, Math.round(sunY) + B, B, B); ctx.fillRect(Math.round(sunX) + B * 2.5, Math.round(sunY) + B * 2, B, B); }

  // clouds drift slowly
  ctx.fillStyle = p.cloud;
  for (const c of clouds) {
    const x = ((c.x * (w + 400) + t * c.v) % (w + 400)) - 200;
    const y = c.y * h * .45 - scroll * .08;
    for (const [dx, dy, cw] of c.shape) ctx.fillRect(Math.round(x + dx * B), Math.round(y + dy * B), cw * B, B);
  }

  const cols = Math.ceil(w / B) + 1;
  const ground = (base, speed) => h - base + scroll * speed;
  const strip = (heights, baseY, top, body, shift) => {
    for (let i = 0; i < cols; i++) {
      const hh = heights[i + shift] || 0, x = i * B, y = baseY - hh * B;
      ctx.fillStyle = top; ctx.fillRect(x, y, B, B);
      ctx.fillStyle = body; ctx.fillRect(x, y + B, B, h - y);
    }
  };
  // far mountains
  strip(layers.far, ground(h * .32, .12), p.farTop, p.far, 3);
  // mid hills
  strip(layers.mid, ground(h * .18, .22), p.midTop, p.mid, 11);
  // near ground: grass, dirt, stone with ores, trees
  const nearBase = ground(B * 4, .35);
  for (let i = 0; i < cols; i++) {
    const hh = layers.near[i + 17], x = i * B, top = nearBase - hh * B;
    ctx.fillStyle = (i % 3 ? p.grass : p.grass2); ctx.fillRect(x, top, B, B);
    ctx.fillStyle = p.dirt; ctx.fillRect(x, top + B, B, B * 3);
    for (let r = 4; top + r * B < h; r++) {
      const o = layers.ores[(i * 7 + r) % layers.ores.length];
      ctx.fillStyle = o < .04 ? p.ore[Math.floor(o * 75) % 3] : (o < .5 ? p.stone : p.stone2);
      ctx.fillRect(x, top + r * B, B, B);
    }
    if (layers.trees[i + 17] && i > 1) {
      ctx.fillStyle = p.log; ctx.fillRect(x, top - B * 4, B, B * 4);
      ctx.fillStyle = p.leaf;
      ctx.fillRect(x - B * 2, top - B * 6, B * 5, B * 2);
      ctx.fillRect(x - B, top - B * 7, B * 3, B);
    }
  }
  // soft shade so panels read well over the scene
  ctx.fillStyle = night ? "rgba(5,8,20,.25)" : "rgba(255,255,255,.08)";
  ctx.fillRect(0, 0, w, h);
}

function loop(t) {
  if (!running) return;
  draw(t);
  raf = requestAnimationFrame(loop);
}

export function startScene() {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "mc-scene";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    const r = rng(77);
    clouds = Array.from({ length: 7 }, () => ({
      x: r(), y: r(), v: .006 + r() * .01,
      shape: [[0, 0, 4 + Math.floor(r() * 4)], [1, -1, 2 + Math.floor(r() * 3)], [-1, 1, 6 + Math.floor(r() * 4)]],
    }));
    stars = Array.from({ length: 140 }, () => ({ x: r(), y: r(), s: r() < .15 ? 3 : 2, p: r() * 6 }));
  }
  canvas.hidden = false;
  if (running) return;
  running = true;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    draw(0); running = false;
    if (!staticBound) { staticBound = true; addEventListener("scroll", () => { if (canvas && !canvas.hidden) draw(0); }, { passive: true }); }
    return;
  }
  raf = requestAnimationFrame(loop);
}

export function stopScene() {
  running = false;
  cancelAnimationFrame(raf);
  if (canvas) canvas.hidden = true;
}
