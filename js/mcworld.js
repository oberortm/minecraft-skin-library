// Minecraft-style block worlds for the presentation, built into the skinview3d scene.
// Everything is generated here: block textures are 16x16 pixel noise drawn on a canvas, the sky is a
// shader, no game assets. The player model stays skinview3d's; the world only adds blocks, light,
// shadows, fog, bloom and ACES tone mapping around it, and removes all of that again on dispose().
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * Light shafts ("god rays") in screen space: from the sun's position on screen, blur outwards
 * whatever is open sky (read from the scene's depth). Trees and the figure block the sky, so
 * they cut visible beams into the light, like shader packs do.
 */
class GodRaysPass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: null }, sun: { value: new THREE.Vector2(0.5, 0.5) },
      aspect: { value: 1 }, strength: { value: 0 }, color: { value: new THREE.Color() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        uniform sampler2D tDiffuse, tDepth; uniform vec2 sun; uniform float aspect, strength; uniform vec3 color;
        varying vec2 vUv;
        float light(vec2 uv) {
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
          float sky = step(0.99999, texture2D(tDepth, uv).x);
          vec2 q = (uv - sun) * vec2(aspect, 1.0);
          return sky * exp(-dot(q, q) * 34.0);
        }
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec2 delta = (vUv - sun) * 0.9 / 48.0;
          vec2 uv = vUv; float w = 1.0, acc = 0.0;
          for (int i = 0; i < 48; i++) { uv -= delta; acc += light(uv) * w; w *= 0.965; }
          gl_FragColor = vec4(base.rgb + color * (acc / 48.0) * strength, base.a);
        }`,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}

const B = 16;      // block size in skin pixels: a player is two blocks tall, as in the game
const FEET = -16;  // y of the player's soles in skinview3d model space (measured: the model spans -16..16)
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const MC_SCENES = ["mc-white", "mc-dark", "mc-sunrise", "mc-night"];

/** Weak device? Phones and small or low-core machines get smaller shadows and no bloom. */
export function guessQuality() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  return coarse || innerWidth < 700 || cores <= 4 || mem <= 4 ? "low" : "high";
}

// ---------- deterministic randomness ----------
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * Smooth noise that repeats every 16 pixels, so block faces tile without seams.
 * n(x, y, sx, sy, off): pixel position, feature size in pixels (x and y), offset to vary the pattern.
 */
function valueNoise(seed) {
  const h = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); };
  const s = t => t * t * (3 - 2 * t);
  return (x, y, sx = 1, sy = sx, off = 0) => {
    const cx = Math.max(1, Math.round(16 / sx)), cy = Math.max(1, Math.round(16 / sy));
    const u = x * cx / 16, v = y * cy / 16;
    const xi = Math.floor(u), yi = Math.floor(v), xf = s(u - xi), yf = s(v - yi);
    const w = (a, c) => ((a % c) + c) % c, X0 = w(xi, cx), X1 = w(xi + 1, cx), Y0 = w(yi, cy), Y1 = w(yi + 1, cy);
    const a = h(X0 + off, Y0), b = h(X1 + off, Y0), c = h(X0 + off, Y1), d = h(X1 + off, Y1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

// ---------- procedural 16x16 block textures ----------
const clamp8 = v => Math.max(0, Math.min(255, Math.round(v)));
function paint(seed, fn) {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(16, 16);
  const r = rng(seed), n = valueNoise(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const [R, G, Bl, A = 255] = fn(x, y, r, n);
    const i = (y * 16 + x) * 4;
    img.data[i] = clamp8(R); img.data[i + 1] = clamp8(G); img.data[i + 2] = clamp8(Bl); img.data[i + 3] = A;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
const shade = (rgb, f) => rgb.map(v => v * f);
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Pick one of a few fixed shades from clustered noise: the calm, blotchy look of classic block art. */
const pal = colors => colors.map(hex);
function pick(p, v) { return p[Math.max(0, Math.min(p.length - 1, Math.floor(v * p.length)))]; }
const GRASS = pal(["#4c7a2e", "#5a8b37", "#659a3f", "#71a848", "#7db552"]);
const DIRT = pal(["#5c3f2a", "#6b4a32", "#7a573b", "#886246", "#966f51"]);
const STONE = pal(["#6c6c6e", "#7a7a7c", "#858587", "#909092", "#9c9c9e"]);
const BARK = pal(["#3e2f1d", "#4c3a24", "#5a462c", "#685234"]);
const WOOD = pal(["#9c7b4b", "#ae8c57", "#bd9a62", "#c9a76d"]);
const LEAF = pal(["#22481a", "#2c5a20", "#376a27", "#43792f", "#4f8738"]);
const SAND = pal(["#cfc38c", "#d8cd97", "#e0d6a3", "#e8dfb0"]);
const WATER = pal(["#2a5596", "#2f5fa5", "#3568b2", "#3b72bd"]);

// Our own block art: a few fixed shades per block, laid out in small structures (pebbles, cracks,
// bark grooves, leaf clusters, ripples) so the faces read like hand-drawn 16x16 pixel art.
const PEBBLE_DARK = hex("#4a3322"), PEBBLE_LIGHT = hex("#a07c5a");
/** Pebbles and specks on dirt-like faces: a lighter pixel with a darker one below it. */
function pebbles(seed, count) {
  const r = rng(seed * 7 + 1), set = new Map();
  for (let i = 0; i < count; i++) {
    const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
    set.set(x + y * 16, PEBBLE_LIGHT); set.set(x + ((y + 1) % 16) * 16, PEBBLE_DARK);
    if (r() < 0.4) set.set(((x + 1) % 16) + y * 16, PEBBLE_LIGHT);
  }
  return set;
}
const dirtAt = (x, y, r, n, peb) => peb.get(x + y * 16) || pick(DIRT, n(x / 2.6, y / 2.6) * 0.55 + r() * 0.45);
function grassAt(x, y, r, n) {
  // patches of lighter and darker grass with short blade strokes
  let v = n(x / 3, y / 3) * 0.6 + n(x / 1.3 + 9, y / 1.3) * 0.25 + r() * 0.2;
  if ((x * 7 + y * 3) % 11 === 0) v += 0.25;
  if ((x * 5 + y * 13) % 17 === 0) v -= 0.3;
  return pick(GRASS, v);
}
/** Stone cracks: short darker strokes with a lighter rim above, fixed per texture. */
function cracks(seed) {
  const r = rng(seed * 3 + 5), m = new Map();
  for (let k = 0; k < 7; k++) {
    let x = Math.floor(r() * 16), y = Math.floor(r() * 16);
    const len = 2 + Math.floor(r() * 4);
    for (let i = 0; i < len; i++) {
      m.set(x + y * 16, -1);
      if (!m.has(x + ((y + 15) % 16) * 16)) m.set(x + ((y + 15) % 16) * 16, 1);
      x = (x + 1) % 16; if (r() < 0.35) y = (y + (r() < 0.5 ? 1 : 15)) % 16;
    }
  }
  return m;
}

const TEX = {
  grassTop: s => paint(s, grassAt),
  grassSide: s => { const peb = pebbles(s, 9); return paint(s, (x, y, r, n) => {
    // grass hangs over the top edge in irregular drips, with a darker rim where it ends
    const drip = 3 + Math.floor(n(x, 0, 1.4, 16, 3) * 2.4) + (r() < 0.12 ? 2 : 0) - (x % 5 === 2 ? 1 : 0);
    if (y < drip) return grassAt(x, y, r, n);
    if (y === drip) return shade(pick(GRASS, 0.05), 0.82);
    return dirtAt(x, y, r, n, peb);
  }); },
  dirt: s => { const peb = pebbles(s, 12); return paint(s, (x, y, r, n) => dirtAt(x, y, r, n, peb)); },
  stone: s => { const cr = cracks(s); return paint(s, (x, y, r, n) => {
    const c = cr.get(x + y * 16);
    if (c === -1) return STONE[0];
    if (c === 1) return STONE[4];
    return pick(STONE, n(x, y, 4, 2.6) * 0.55 + n(x, y, 1.5, 1.5, 4) * 0.25 + r() * 0.2 + 0.05);
  }); },
  sand: s => paint(s, (x, y, r, n) => {
    const v = r();
    if (v < 0.06) return hex("#b9ab78");     // darker grains
    if (v > 0.95) return hex("#f2ebc4");     // bright grains
    return pick(SAND, n(x, y, 3, 3) * 0.5 + r() * 0.5);
  }),
  logSide: s => paint(s, (x, y, r, n) => {
    // vertical bark ridges and grooves, an occasional knot
    const ridge = n(x, 0, 1.2, 16, 5) + Math.sin(x * Math.PI * 10 / 16 + n(0, y, 16, 6, 7) * 2) * 0.25;
    if ((x === 3 || x === 9 || x === 13) && n(x, y, 1, 3, 2) > 0.35) return BARK[0];
    const knot = Math.hypot(x - 10.5, y - 6.5) < 1.6;
    if (knot) return Math.hypot(x - 10.5, y - 6.5) < 0.8 ? BARK[0] : BARK[3];
    return pick(BARK, ridge * 0.6 + n(x, y, 1, 5, 4) * 0.2 + r() * 0.2);
  }),
  logTop: s => paint(s, (x, y, r) => {
    const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
    if (Math.max(dx, dy) > 6.5) return pick(BARK, 0.3 + r() * 0.5);
    const d = Math.cbrt(dx ** 3 + dy ** 3);   // rounded square rings
    if (d < 1.2) return WOOD[0];
    return pick(WOOD, (Math.floor(d / 1.6) % 2 ? 0.1 : 0.7) + r() * 0.25);
  }),
  leaves: s => paint(s, (x, y, r, n) => {
    // leaves as small clusters: a light tip, a mid body and a dark shadow under it; a few gaps
    const ox = (x + 2 * (Math.floor(y / 4) % 2)) % 4, oy = y % 4;
    if (r() < 0.09 && (ox === 3 || oy === 3)) return [0, 0, 0, 0];
    let v = n(x, y, 4, 4) * 0.35 + r() * 0.2 + 0.3;
    if (ox === 0 && oy === 0) v += 0.4; else if (ox <= 1 && oy <= 1) v += 0.15; else if (ox === 3 || oy === 3) v -= 0.35;
    return pick(LEAF, v);
  }),
  water: s => paint(s, (x, y, r, n) => {
    // soft horizontal ripples with bright crests
    const w = Math.sin((y + n(x, y, 3, 4) * 3) * Math.PI * 6 / 16);
    if (w > 0.93 && r() < 0.7) return hex("#5b8fd6");
    return pick(WATER, (w + 1) * 0.35 + r() * 0.25);
  }),
  quartz: s => paint(s, (x, y, r) => {
    let f = 0.96 + r() * 0.04;
    if (x === 0 || y === 0) f *= 1.04;
    if (x === 15 || y === 15) f *= 0.9;
    return shade(hex("#ecebe5"), f);
  }),
  quartzTile: s => paint(s, (x, y, r) => {
    let f = 0.95 + r() * 0.04;
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 3 && d < 4.5) f *= 0.9;
    if (x === 0 || y === 0) f *= 1.04;
    if (x === 15 || y === 15) f *= 0.88;
    return shade(hex("#eeede8"), f);
  }),
  pillar: s => paint(s, (x, y, r) => {
    let f = 0.95 + r() * 0.04;
    if (x === 3 || x === 12) f *= 0.86;
    if (x === 0 || x === 15) f *= 0.9;
    return shade(hex("#ecebe5"), f);
  }),
  dark: s => paint(s, (x, y, r, n) => {
    const crack = Math.abs(n(x, y, 3, 3) - 0.5) < 0.04 ? 0.6 : 1;
    return shade(hex("#2b2830"), (0.8 + r() * 0.35) * crack);
  }),
  darkBrick: s => paint(s, (x, y, r) => {
    const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
    const mortar = y % 4 === 3 || (x + off) % 8 === 7;
    return mortar ? shade(hex("#17151b"), 0.9 + r() * 0.2) : shade(hex("#37323d"), 0.82 + r() * 0.3);
  }),
  darkPolished: s => paint(s, (x, y, r) => {
    let f = 0.9 + r() * 0.12;
    if (x === 0 || y === 0) f *= 1.2;
    if (x === 15 || y === 15) f *= 0.75;
    return shade(hex("#3a3541"), f);
  }),
  // studio walls: almost plain, a faint large-tile pattern so the surface still reads
  studioWhite: s => paint(s, (x, y, r) => {
    const joint = x === 0 || y === 0;
    return shade(hex("#f8f8f6"), (joint ? 0.972 : 1) * (0.99 + r() * 0.01));
  }),
  studioDark: s => paint(s, (x, y, r) => {
    const joint = x === 0 || y === 0;
    return shade(hex("#2d2a33"), (joint ? 0.8 : 1) * (0.94 + r() * 0.08));
  }),
  panel: s => paint(s, (x, y, r) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    return edge ? shade(hex("#d9d6cd"), 0.95 + r() * 0.05) : shade(hex("#fffaf0"), 0.97 + r() * 0.03);
  }),
  glowAmber: s => paint(s, (x, y, r, n) => shade(hex("#ffc163"), 0.7 + r() * 0.3 + n(x, y, 2, 2) * 0.3)),
  glowCyan: s => paint(s, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = d > 5.5 ? 0.62 : d > 3.5 ? 1.05 : 0.85;
    return shade(hex("#86e8dc"), ring * (0.88 + r() * 0.16));
  }),
};

/** Block types: per-face textures in BoxGeometry order (+x, -x, +y, -y, +z, -z). */
const BLOCKS = {
  grass: { faces: ["grassSide", "grassSide", "grassTop", "dirt", "grassSide", "grassSide"] },
  dirt: { faces: "dirt" },
  stone: { faces: "stone" },
  sand: { faces: "sand" },
  log: { faces: ["logSide", "logSide", "logTop", "logTop", "logSide", "logSide"] },
  leaves: { faces: "leaves", cutout: true },
  quartz: { faces: "quartz" },
  quartzTile: { faces: "quartzTile" },
  pillar: { faces: ["pillar", "pillar", "quartz", "quartz", "pillar", "pillar"] },
  dark: { faces: "dark" },
  darkBrick: { faces: "darkBrick" },
  darkPolished: { faces: "darkPolished" },
  glowAmber: { faces: "glowAmber", glow: ["#ffb347", 2.4] },
  panel: { faces: ["quartz", "quartz", "quartz", "panel", "quartz", "quartz"], glow: ["#fff6e6", 1.5] },
  glowCyan: { faces: "glowCyan", glow: ["#6ff0e0", 2.2] },
};
const SEETHROUGH = new Set(["leaves"]);

/**
 * Soft block ambient occlusion, like smooth lighting in the game: every block instance knows which of
 * its 26 neighbours are filled (two 13-bit masks); faces darken softly towards edges that touch one.
 */
const AO_GLSL = `
varying vec2 vAoMask; varying vec3 vAoPos; varying vec3 vAoN;
float aoBit(float idx) {
  float v = idx < 13.5 ? vAoMask.x : vAoMask.y;
  float i = idx < 13.5 ? idx : idx - 14.0;
  return mod(floor(v / exp2(i)), 2.0);
}
float aoOcc(vec3 o) { return aoBit((o.x + 1.0) * 9.0 + (o.y + 1.0) * 3.0 + (o.z + 1.0)); }
float aoEdge(float t) { return smoothstep(0.02, 0.5, t); }
float blockAO() {
  vec3 n = normalize(vAoN), an = abs(n);
  vec3 U, V; float a, b;
  if (an.x > 0.5) { U = vec3(0.0, 1.0, 0.0); V = vec3(0.0, 0.0, 1.0); a = vAoPos.y; b = vAoPos.z; }
  else if (an.y > 0.5) { U = vec3(1.0, 0.0, 0.0); V = vec3(0.0, 0.0, 1.0); a = vAoPos.x; b = vAoPos.z; }
  else { U = vec3(1.0, 0.0, 0.0); V = vec3(0.0, 1.0, 0.0); a = vAoPos.x; b = vAoPos.y; }
  vec3 N = sign(n) * step(0.5, an);
  float s1 = aoOcc(N + U), s2 = aoOcc(N - U), s3 = aoOcc(N + V), s4 = aoOcc(N - V);
  float ea = aoEdge(a), eA = aoEdge(-a), eb = aoEdge(b), eB = aoEdge(-b);
  float o = s1 * ea + s2 * eA + s3 * eb + s4 * eB;
  o += aoOcc(N + U + V) * ea * eb * (1.0 - s1) * (1.0 - s3) + aoOcc(N + U - V) * ea * eB * (1.0 - s1) * (1.0 - s4)
     + aoOcc(N - U + V) * eA * eb * (1.0 - s2) * (1.0 - s3) + aoOcc(N - U - V) * eA * eB * (1.0 - s2) * (1.0 - s4);
  return 1.0 - 0.42 * min(o, 1.4);
}`;
function addBlockAO(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aoMask; varying vec2 vAoMask; varying vec3 vAoPos; varying vec3 vAoN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAoMask = aoMask; vAoPos = position / 16.0; vAoN = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + AO_GLSL)
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n{ float bao = blockAO(); reflectedLight.indirectDiffuse *= bao; reflectedLight.directDiffuse *= mix(1.0, bao, 0.5); }");
  };
  m.customProgramCacheKey = () => "block-ao";
}

/** Standard material for the studio rooms, with soft darkening where floor, walls and ceiling meet. */
function studioMaterial(params, room) {
  const m = new THREE.MeshStandardMaterial({ metalness: 0, ...params });
  m.onBeforeCompile = sh => {
    sh.uniforms.roomHalf = { value: room.half }; sh.uniforms.roomFloor = { value: room.floorY }; sh.uniforms.roomCeil = { value: room.ceilY };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRoomPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvRoomPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vRoomPos; uniform float roomHalf, roomFloor, roomCeil;
        float roomAO() {
          float d[6]; d[0] = roomHalf - vRoomPos.x; d[1] = roomHalf + vRoomPos.x; d[2] = roomHalf - vRoomPos.z;
          d[3] = roomHalf + vRoomPos.z; d[4] = vRoomPos.y - roomFloor; d[5] = roomCeil - vRoomPos.y;
          float ao = 1.0;
          for (int i = 0; i < 6; i++) if (d[i] > 1.0) ao *= 1.0 - 0.32 * exp(-d[i] / 34.0);
          return ao;
        }`)
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n{ float rao = roomAO(); reflectedLight.indirectDiffuse *= rao; reflectedLight.directDiffuse *= mix(1.0, rao, 0.6); }");
  };
  m.customProgramCacheKey = () => "studio-ao";
  return m;
}

/** Sky dome: gradient, square sun or moon, stars. Outputs linear HDR; the output pass tone-maps it. */
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
      sunSize: { value: 0.05 }, glow: { value: 0 }, stars: { value: 0 }, time: { value: 0 }, moon: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sunDir, sunColor; uniform float sunSize, glow, stars, time, moon;
      varying vec3 vDir;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h * 3.0, 0.0, 1.0), 0.7));
        vec3 s = normalize(sunDir);
        float c = max(dot(d, s), 0.0);
        // square disc, like the blocky sun and moon of the game
        vec3 up = abs(s.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 tx = normalize(cross(up, s)), ty = cross(s, tx);
        vec2 q = vec2(dot(d, tx), dot(d, ty)) / sunSize;
        float disc = step(max(abs(q.x), abs(q.y)), 1.0) * step(0.0, dot(d, s));
        if (moon > 0.5) {
          vec2 cell = floor((q + 1.0) * 4.0);
          float crater = hash(vec3(cell, 3.0)) > 0.72 ? 0.78 : 1.0;
          disc *= crater;
        }
        col += sunColor * (disc * (moon > 0.5 ? 1.6 : 2.2) + pow(c, 220.0) * glow * 0.9 + pow(c, 18.0) * glow * 0.45 + pow(c, 4.0) * glow * 0.12);
        if (stars > 0.0 && h > -0.02) {
          vec3 p = floor(d * 260.0);
          float r = hash(p);
          if (r > 0.9965) {
            float tw = 0.6 + 0.4 * sin(time * (1.5 + r * 4.0) + r * 60.0);
            col += vec3(0.85, 0.9, 1.0) * stars * tw * smoothstep(-0.02, 0.25, h) * (r - 0.9965) * 420.0;
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Soft round glow for light sources; works with and without bloom. */
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d").createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,.45)"); g.addColorStop(1, "rgba(255,255,255,0)");
  const ctx = c.getContext("2d"); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Soft rays around the low sun. */
function raysTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d"), r = rng(7);
  ctx.translate(128, 128);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, w = 0.02 + r() * 0.07, len = 70 + r() * 58;
    const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,220,170,${0.2 + r() * 0.2})`); g.addColorStop(1, "rgba(255,200,150,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, len, a - w, a + w); ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,236,200,.9)"); g.addColorStop(0.18, "rgba(255,200,140,.35)"); g.addColorStop(1, "rgba(255,160,100,0)");
  ctx.fillStyle = g; ctx.fillRect(-128, -128, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- scene looks ----------
const LIGHT_AZ = -2.7; // where the sun rises and the moon stands; the island stays low that way
const sunAt = (azimuth, elevation) => new THREE.Vector3(
  Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));

const LOOKS = {
  "mc-white": {
    set: "roomWhite", exposure: 1.12,
    sky: { top: "#f4f5f7", horizon: "#ffffff", bottom: "#e9eaee", sun: sunAt(0.6, 1.0), sunColor: "#ffffff", sunSize: 0.0001, glow: 0 },
    fog: ["#f6f6f4", 260, 900], hemi: ["#ffffff", "#e6e3dc", 1.35],
    key: { dir: sunAt(0.55, 1.3), color: "#fff6ea", intensity: 1.45 }, fill: 0.35,
    bloom: [0.22, 0.45, 0.9], player: [0.25, 0.3],
  },
  "mc-dark": {
    // a stage: one cone of light from above, the room only just visible around it
    set: "roomDark", exposure: 1.0,
    sky: { top: "#030305", horizon: "#07060a", bottom: "#020203", sun: sunAt(0, 1.4), sunColor: "#000000", sunSize: 0.0001, glow: 0 },
    fog: ["#050408", 160, 520], hemi: ["#2c2a36", "#0a0910", 0.22],
    key: null, spot: { color: "#fff0d6", intensity: 5.2, angle: 0.3, penumbra: 0.5 }, fill: 0.55,
    // high bloom threshold: bright hair lit from above must not glow
    bloom: [0.35, 0.5, 0.97], player: [0.15, 1.2],
  },
  "mc-sunrise": {
    set: "land", exposure: 1.0,
    sky: { top: "#3a5a92", horizon: "#ffb27a", bottom: "#c88a6a", sun: sunAt(LIGHT_AZ, 0.09), sunColor: "#ffc896", sunSize: 0.03, glow: 0.9 },
    fog: ["#f2b48a", 180, 760], hemi: ["#a8c4ff", "#7a5236", 0.72],
    key: { dir: sunAt(LIGHT_AZ, 0.2), color: "#ffb36b", intensity: 2.4 }, fill: 0.3,
    bloom: [0.4, 0.55, 0.85], player: [0.2, 0.45], rays: { color: "#ffc994", strength: 0.6, sprite: true }, face: LIGHT_AZ, water: ["#2a5a8c", 1, 2.0],
  },
  "mc-night": {
    set: "land", exposure: 1.35,
    // only moon and starlight: a cool key light from the moon, a faint blue sky light, no lamps
    sky: { top: "#040814", horizon: "#16264a", bottom: "#070b14", sun: sunAt(LIGHT_AZ, 0.13), sunColor: "#e4ecff", sunSize: 0.036, glow: 0.3, stars: 1.3, moon: 1 },
    fog: ["#101c34", 170, 700], hemi: ["#5470b8", "#0e0d10", 0.55],
    // the moon stands where the sun rises: diagonally left behind the figure, mirrored in the lake
    key: { dir: sunAt(LIGHT_AZ, 0.32), color: "#b4c8ff", intensity: 1.15 }, fill: 0.4, fillColor: "#c8d6ff",
    bloom: [0.5, 0.6, 0.8], player: [0.15, 0.35], rays: { color: "#9fb6ff", strength: 0.2 }, water: ["#0c1c36", 0.3, 0.45], face: LIGHT_AZ,
  },
};

export class McWorld {
  /** fixed: the user chose the quality, so it is never lowered automatically. */
  constructor(viewer, quality = guessQuality(), fixed = false) {
    this.viewer = viewer;
    this.quality = quality;
    this.fixedQuality = fixed;
    this.root = new THREE.Group();
    this.root.name = "mc-world";
    this.sets = {};
    this.textures = new Map();
    this.materials = new Map();
    this.disposables = [];
    this.lookId = null;
    this.clock = new THREE.Clock();
    this.frames = 0; this.slow = 0;
    this.saved = null;
    this.install();
  }

  // ---------- renderer and viewer setup ----------
  install() {
    const v = this.viewer, r = v.renderer;
    this.saved = {
      toneMapping: r.toneMapping, exposure: r.toneMappingExposure, shadows: r.shadowMap.enabled, shadowType: r.shadowMap.type,
      autoRotate: v.autoRotate, ctl: { min: v.controls.minPolarAngle, max: v.controls.maxPolarAngle, maxD: v.controls.maxDistance, minD: v.controls.minDistance, autoRotate: v.controls.autoRotate, speed: v.controls.autoRotateSpeed },
      amb: v.globalLight.intensity, cam: v.cameraLight.intensity, rtType: v.composer.renderTarget1.texture.type,
      pixelRatio: r.getPixelRatio(), wrapperY: v.playerWrapper.rotation.y,
    };
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.needsUpdate = true;
    // HDR between passes so bright lights bloom and tone-map instead of clipping
    const ext = r.extensions;
    this.hdr = r.capabilities.isWebGL2 && (ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float"));
    if (this.hdr) this.setTargetType(THREE.HalfFloatType);
    if (this.quality === "low" && r.getPixelRatio() > 1.5) { r.setPixelRatio(1.5); v.updateComposerSize(); }
    this.output = new OutputPass();
    v.composer.insertPass(this.output, 1);
    if (this.quality === "high") { this.addBloom(); this.addRays(); }
    // the camera circles the figure; the world stays put
    v.playerWrapper.rotation.y = 0;
    v.controls.target.set(0, -2, 0);
    v.controls.minPolarAngle = 0.75;
    v.controls.maxPolarAngle = 1.52;
    v.controls.minDistance = 30;
    v.controls.maxDistance = 175;
    const dist = v.camera.position.length();
    v.camera.position.set(0.5, 0.2, 1).normalize().multiplyScalar(dist);
    v.controls.update();
    v.scene.add(this.root);
    this.player(true);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMaterial());
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.root.add(this.sky);
    this.disposables.push(this.sky.geometry, this.sky.material);
    this.hemi = new THREE.HemisphereLight();
    this.key = new THREE.DirectionalLight();
    this.key.castShadow = true;
    const map = this.quality === "high" ? 2048 : 1024;
    this.key.shadow.mapSize.set(map, map);
    Object.assign(this.key.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 10, far: 900 });
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.key.target.position.set(0, FEET, 0);
    this.root.add(this.hemi, this.key, this.key.target);
    // soft light from the viewer's side so the figure's front is never lost in the dark
    this.fillLight = new THREE.DirectionalLight("#ffffff", 0);
    this.fillLight.position.set(0, 0.3, 1);
    v.camera.add(this.fillLight);
    v.scene.onBeforeRender = () => this.tick();
    // camera collision: the controls keep the distance you chose; if blocks are between the figure and
    // the camera, the camera is drawn in front of them for that frame instead of ending up inside a hill
    const ctl = v.controls, update = ctl.update.bind(ctl);
    const ray = new THREE.Raycaster(), dir = new THREE.Vector3();
    this.restoreControls = () => { ctl.update = update; };
    ctl.update = () => {
      const cam = v.camera, tgt = ctl.target;
      // a cinematic moves the camera itself
      if (this.freeCamera) { const out = update(); this.wantDist = cam.position.distanceTo(tgt); return out; }
      if (this.wantDist) cam.position.sub(tgt).setLength(this.wantDist).add(tgt);
      const out = update();
      this.wantDist = cam.position.distanceTo(tgt);
      const land = this.sets.land;
      if (land && land.visible && this.landMeshes) {
        dir.subVectors(cam.position, tgt).normalize();
        ray.set(tgt, dir); ray.far = this.wantDist;
        const hit = ray.intersectObjects(this.landMeshes, false)[0];
        if (hit) cam.position.copy(tgt).addScaledVector(dir, Math.max(ctl.minDistance * 0.6, hit.distance - 6));
      }
      return out;
    };
  }

  setTargetType(type) {
    const c = this.viewer.composer;
    for (const rt of [c.renderTarget1, c.renderTarget2]) { rt.texture.type = type; rt.dispose(); }
  }

  addBloom() {
    if (this.bloom || !this.hdr) return;
    const v = this.viewer;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(v.width, v.height), 0.5, 0.5, 0.8);
    v.composer.insertPass(this.bloom, 1);
    v.updateComposerSize();
    if (this.lookId) this.applyBloom(LOOKS[this.lookId]);
  }
  /** Volumetric light needs the scene depth (WebGL2) and HDR targets; on weak devices the sprite stays. */
  addRays() {
    const v = this.viewer;
    if (this.godRays || !this.hdr || !v.composer.renderTarget1.depthTexture) return;
    // the composer's second buffer shares its depth image with the first (Texture.clone keeps the
    // source); give it its own, or reading depth while writing the other buffer is a feedback loop
    const rt2 = v.composer.renderTarget2;
    this.sharedDepth = rt2.depthTexture;
    rt2.depthTexture = new THREE.DepthTexture(rt2.width, rt2.height, THREE.FloatType);
    rt2.dispose();
    this.godRays = new GodRaysPass();
    this.godRays.enabled = false;
    v.composer.insertPass(this.godRays, 1);
    v.updateComposerSize();
    if (this.lookId) this.setLook(this.lookId, { keepCamera: true });
  }
  removeRays() {
    if (!this.godRays) return;
    const c = this.viewer.composer;
    c.removePass(this.godRays);
    this.godRays.dispose();
    this.godRays = null;
    if (this.sharedDepth) { c.renderTarget2.depthTexture.dispose(); c.renderTarget2.depthTexture = this.sharedDepth; c.renderTarget2.dispose(); this.sharedDepth = null; }
    if (this.lookId) this.setLook(this.lookId, { keepCamera: true });
  }

  removeBloom() {
    if (!this.bloom) return;
    this.viewer.composer.removePass(this.bloom);
    this.bloom.dispose();
    this.bloom = null;
  }
  applyBloom(look) {
    if (!this.bloom) return;
    [this.bloom.strength, this.bloom.radius, this.bloom.threshold] = look.bloom;
  }

  /** Skin meshes cast shadows; the skin texture is sRGB like the block textures. */
  player(on) {
    const v = this.viewer;
    v.playerObject.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = on && o.material.blending === THREE.NormalBlending; o.receiveShadow = false;
      // armour and items from equipment.js are colour textures like the skin
      const m = o.material.map;
      if (m && m.userData.equipment) { m.colorSpace = on ? THREE.SRGBColorSpace : THREE.NoColorSpace; m.needsUpdate = true; }
    });
    for (const t of [v.skinTexture, v.capeTexture]) {
      if (t) { t.colorSpace = on ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; }
    }
  }
  /** Call after every loadSkin: skinview3d creates a new texture each time. */
  skinChanged() { this.player(true); }

  // ---------- blocks ----------
  /** A block texture: from the user's resource pack if one is loaded, else drawn here. */
  makeTexture(name) {
    const img = (this.pack && this.pack[name]) || TEX[name](name.length * 131 + name.charCodeAt(0));
    const t = new THREE.CanvasTexture(img);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, this.viewer.renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  /** Swap in a resource pack ({ texName: canvas }) or go back to our own textures (null). */
  setPack(canvases) {
    this.pack = canvases || null;
    const old = [...this.textures.values()];
    this.textures.clear();
    for (const [key, m] of this.materials) {
      const t = this.texture(key.split("|")[0]);
      if (m.emissiveMap) m.emissiveMap = t;
      m.map = t; m.needsUpdate = true;
    }
    if (this.water) {
      const wm = this.waterSimple, wt = this.makeTexture("water");
      wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(140, 140); wt.minFilter = THREE.NearestFilter;
      const prev = wm.map; wm.map = wt; wm.needsUpdate = true;
      if (this.waterFancy) this.waterFancy.uniforms.tColor.value = wt;
      this.disposables = this.disposables.filter(d => d !== prev); prev.dispose(); this.disposables.push(wt);
    }
    old.forEach(t => t.dispose());
  }

  texture(name) {
    if (!this.textures.has(name)) {
      const t = this.makeTexture(name);
      this.textures.set(name, t);
    }
    return this.textures.get(name);
  }
  material(texName, type) {
    const key = texName + "|" + type;
    if (!this.materials.has(key)) {
      const def = BLOCKS[type];
      const m = new THREE.MeshStandardMaterial({ map: this.texture(texName), roughness: 0.92, metalness: 0 });
      if (def.cutout) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      if (def.glow) { m.emissive = new THREE.Color(def.glow[0]); m.emissiveMap = m.map; m.emissiveIntensity = def.glow[1]; }
      addBlockAO(m);
      this.materials.set(key, m);
    }
    return this.materials.get(key);
  }

  /** Turn a list of [type, x, y, z] grid cells into one InstancedMesh per block type, skipping buried blocks. */
  buildBlocks(cells, seed, { shadows = true } = {}) {
    const group = new THREE.Group();
    const solid = new Set();
    for (const [type, x, y, z] of cells) if (!SEETHROUGH.has(type)) solid.add(x + "," + y + "," + z);
    const byType = new Map();
    for (const c of cells) {
      const [type, x, y, z] = c;
      const buried = !SEETHROUGH.has(type) && [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
        .every(([dx, dy, dz]) => solid.has((x + dx) + "," + (y + dy) + "," + (z + dz)));
      if (buried) continue;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(c);
    }
    const box = new THREE.BoxGeometry(B, B, B);
    this.disposables.push(box);
    const all = new Set(cells.map(([, x, y, z]) => x + "," + y + "," + z));
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), r = rng(seed);
    for (const [type, list] of byType) {
      const f = BLOCKS[type].faces;
      const mats = (Array.isArray(f) ? f : Array(6).fill(f)).map(n => this.material(n, type));
      // neighbour masks for the ambient occlusion shader
      const geo = box.clone(), ao = new Float32Array(list.length * 2);
      list.forEach(([, x, y, z], i) => {
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
          const idx = (dx + 1) * 9 + (dy + 1) * 3 + (dz + 1);
          if (idx === 13 || !all.has((x + dx) + "," + (y + dy) + "," + (z + dz))) continue;
          if (idx < 13) ao[i * 2] += 2 ** idx; else ao[i * 2 + 1] += 2 ** (idx - 14);
        }
      });
      geo.setAttribute("aoMask", new THREE.InstancedBufferAttribute(ao, 2));
      this.disposables.push(geo);
      const mesh = new THREE.InstancedMesh(geo, mats, list.length);
      list.forEach(([, x, y, z], i) => {
        m4.makeTranslation(x * B, FEET - B / 2 + y * B, z * B);
        mesh.setMatrixAt(i, m4);
        const k = 0.9 + r() * 0.1;
        mesh.setColorAt(i, col.setRGB(k, k, k));
      });
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    return group;
  }

  /** A square room with a plinth in the middle; big enough that the orbiting camera stays inside. */
  /**
   * A seamless photo studio: smooth floor, walls and ceiling (no block joints), corners softened by an
   * analytic occlusion term, a faint texture on the walls, a plinth for the figure. White: light panels
   * in the ceiling. Dark: the same room, lit only by the cone from above.
   */
  buildRoom(white) {
    const g = new THREE.Group();
    const half = 12 * B, floorY = FEET - B, ceilY = floorY + (white ? 10 : 8) * B;
    const room = { half, floorY, ceilY };
    const wallTex = new THREE.CanvasTexture(TEX[white ? "studioWhite" : "studioDark"](white ? 41 : 42));
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
    wallTex.magFilter = THREE.NearestFilter; wallTex.colorSpace = THREE.SRGBColorSpace;
    wallTex.repeat.set(12, (ceilY - floorY) / (B * 2));
    const base = white ? "#f4f4f2" : "#2a272f";
    const floorMat = studioMaterial({ color: white ? "#f6f6f4" : "#35313b", roughness: white ? 0.85 : 0.55 }, room);
    const wallMat = studioMaterial({ color: base, map: wallTex, roughness: 0.95 }, room);
    const ceilMat = studioMaterial({ color: white ? "#fbfbfa" : "#141218", roughness: 1 }, room);
    const plane = (w, h, mat, pos, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(...pos); m.rotation.set(...rot); m.receiveShadow = true;
      this.disposables.push(m.geometry);
      g.add(m); return m;
    };
    const span = half * 2, height = ceilY - floorY, mid = (floorY + ceilY) / 2;
    plane(span, span, floorMat, [0, floorY, 0], [-Math.PI / 2, 0, 0]);
    plane(span, span, ceilMat, [0, ceilY, 0], [Math.PI / 2, 0, 0]);
    plane(span, height, wallMat, [0, mid, -half], [0, 0, 0]);
    plane(span, height, wallMat, [0, mid, half], [0, Math.PI, 0]);
    plane(span, height, wallMat, [-half, mid, 0], [0, Math.PI / 2, 0]);
    plane(span, height, wallMat, [half, mid, 0], [0, -Math.PI / 2, 0]);
    // plinth: the figure stands one block above the floor
    const plinthGeo = new THREE.BoxGeometry(3 * B, B, 3 * B);
    const plinth = new THREE.Mesh(plinthGeo, studioMaterial({ color: white ? "#ffffff" : "#3c3843", roughness: white ? 0.7 : 0.45 }, room));
    plinth.position.set(0, FEET - B / 2, 0); plinth.castShadow = plinth.receiveShadow = true;
    g.add(plinth);
    this.disposables.push(plinthGeo, wallTex, floorMat, wallMat, ceilMat, plinth.material);
    if (white) {
      // light panels in the ceiling, slightly below it so they glow (and bloom on high quality)
      const panelGeo = new THREE.BoxGeometry(2 * B, 1, 2 * B), panelMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6e8", emissiveIntensity: 1.6 });
      const spots = [];
      for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) spots.push([x * 4 * B, z * 4 * B]);
      const panels = new THREE.InstancedMesh(panelGeo, panelMat, spots.length);
      const m4 = new THREE.Matrix4();
      spots.forEach(([x, z], i) => panels.setMatrixAt(i, m4.makeTranslation(x, ceilY - 0.6, z)));
      panels.frustumCulled = false;
      g.add(panels);
      this.disposables.push(panelGeo, panelMat);
    }
    return g;
  }

  /** A small island: grass, dirt, stone, sand at the shore, trees beyond the camera's circle, water around. */
  buildLand() {
    // a bigger island: free clearing around the figure, hills further out, a lake towards the
    // sun/moon (so its reflection shows), three trees, a few boulders
    const cells = [], n = valueNoise(3), r = rng(5), R = 30;
    const ang = (x, z) => Math.abs(Math.atan2(Math.sin(Math.atan2(x, z) - LIGHT_AZ), Math.cos(Math.atan2(x, z) - LIGHT_AZ)));
    const lake = [Math.sin(LIGHT_AZ) * 14, Math.cos(LIGHT_AZ) * 14];
    const height = (x, z) => {
      const d = Math.hypot(x, z);
      const dl = Math.hypot(x - lake[0], z - lake[1]) - n(x / 3, z / 3) * 1.6;
      if (dl < 5.2) return -2;
      if (d <= 7) return 0;
      const ramp = Math.min(1, (d - 7) / 6);
      let h = ((n(x / 6, z / 6) - 0.32) * 5 + (d > 13 ? (d - 13) * 0.38 : 0)) * ramp;
      if (ang(x, z) < 0.6) h *= 0.25;                       // keep the view to the light open
      if (dl < 9) h *= Math.max(0, (dl - 5.2) / 3.8);        // soft lake shore
      const shore = Math.max(0, (d - (R - 4)) / 4);
      return Math.round(Math.max(-1, Math.min(7, h * (1 - shore) - shore * 2)));
    };
    const tops = new Map();
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
      if (Math.hypot(x, z) > R + 0.5) continue;
      const h = height(x, z);
      tops.set(x + "," + z, h);
      const sandy = h <= 0 && (Math.hypot(x, z) > R - 4 || Math.hypot(x - lake[0], z - lake[1]) < 7.5);
      for (let y = Math.min(h, -1) - 2; y <= h; y++) {
        let type = y === h ? (sandy ? "sand" : "grass") : y >= h - 2 ? (sandy ? "sand" : "dirt") : "stone";
        if (y === h && h >= 4 && n(x / 2, z / 2 + 9) > 0.5) type = "stone";
        cells.push([type, x, y, z]);
      }
    }
    // three trees, away from the lake and the clearing
    for (const [a, d] of [[LIGHT_AZ + 1.9, 14], [LIGHT_AZ + 2.9, 15], [LIGHT_AZ - 2.2, 14]]) {
      const x = Math.round(Math.sin(a) * d), z = Math.round(Math.cos(a) * d);
      const h = tops.get(x + "," + z);
      if (h === undefined || h < 0) continue;
      const trunk = 5 + Math.floor(r() * 2);
      for (let y = 1; y <= trunk; y++) cells.push(["log", x, h + y, z]);
      for (let dy = trunk - 2; dy <= trunk + 1; dy++) {
        const rad = dy >= trunk ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < trunk) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue;
          cells.push(["leaves", x + dx, h + dy, z + dz]);
        }
      }
    }
    // a few boulders at the edge of the clearing
    for (const [a, d] of [[LIGHT_AZ + 1.2, 8], [LIGHT_AZ - 1.4, 8.5], [LIGHT_AZ + 3.4, 9]]) {
      const x = Math.round(Math.sin(a) * d), z = Math.round(Math.cos(a) * d), h = tops.get(x + "," + z) ?? 0;
      cells.push(["stone", x, h + 1, z], ["stone", x + 1, h + 1, z], ["stone", x, h + 2, z]);
    }
    const g = this.buildBlocks(dedupe(cells), 21);
    this.landMeshes = g.children.filter(o => o.isInstancedMesh);
    // water: one big plane, fades into the fog
    const wt = this.makeTexture("water");
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(140, 140); wt.minFilter = THREE.NearestFilter;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ map: wt, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = FEET - 3; // just below the grass, so the lake is full
    water.receiveShadow = true;
    g.add(water);
    this.water = water;
    this.waterSimple = water.material;
    this.disposables.push(wt, water.geometry, water.material);
    return g;
  }

  // ---------- reflective water (high quality) ----------
  /** A mirror camera renders the scene below the water plane; a shader mixes it in with waves and Fresnel. */
  enableReflections() {
    if (!this.water || this.waterFancy) return;
    const r = this.viewer.renderer;
    const size = new THREE.Vector2(); r.getDrawingBufferSize(size);
    this.reflectRT = new THREE.WebGLRenderTarget(Math.max(256, size.x >> 1), Math.max(256, size.y >> 1), { type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType });
    this.reflectCam = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.waterFancy = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        tReflect: { value: this.reflectRT.texture }, tColor: { value: this.waterSimple.map }, textureMatrix: { value: this.textureMatrix },
        time: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() },
        waterColor: { value: new THREE.Color("#1f4f80") }, light: { value: 1 }, spec: { value: 2 },
        fogColor: { value: new THREE.Color() }, fogNear: { value: 200 }, fogFar: { value: 800 },
      },
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 vRefl; varying vec3 vWorld;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vRefl = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform sampler2D tReflect, tColor; uniform float time, light, spec, fogNear, fogFar;
        uniform vec3 sunDir, sunColor, waterColor, fogColor;
        varying vec4 vRefl; varying vec3 vWorld;
        float wave(vec2 p) {
          return sin(p.x * 0.045 + time * 0.9) * 0.5 + sin(p.y * 0.06 - time * 0.7) * 0.5
               + sin((p.x + p.y) * 0.11 + time * 1.3) * 0.25 + sin((p.x - p.y) * 0.21 - time * 1.7) * 0.15;
        }
        void main() {
          vec2 p = vWorld.xz;
          float dx = wave(p + vec2(1.0, 0.0)) - wave(p - vec2(1.0, 0.0));
          float dz = wave(p + vec2(0.0, 1.0)) - wave(p - vec2(0.0, 1.0));
          vec3 n = normalize(vec3(-dx * 0.35, 1.0, -dz * 0.35));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
          vec3 refl = texture2D(tReflect, vRefl.xy / vRefl.w + n.xz * 0.03).rgb;
          vec3 base = texture2D(tColor, p / 16.0).rgb * 0.3 + waterColor * 0.5;
          vec3 col = mix(base * light, refl, clamp(fres + 0.2, 0.0, 1.0));
          vec3 rs = reflect(-normalize(sunDir), n);
          col += sunColor * pow(max(dot(rs, v), 0.0), 220.0) * spec;
          float f = smoothstep(fogNear, fogFar, length(vWorld - cameraPosition));
          gl_FragColor = vec4(mix(col, fogColor, f), 0.93);
        }`,
    });
    const w = this.water, self = this;
    const plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
    const mirrorPos = new THREE.Vector3(), camPos = new THREE.Vector3(), normal = new THREE.Vector3(), rot = new THREE.Matrix4();
    const view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3();
    w.material = this.waterFancy;
    w.onBeforeRender = (renderer, scene, camera) => {
      if (self.inReflection) return;
      mirrorPos.setFromMatrixPosition(w.matrixWorld);
      camPos.setFromMatrixPosition(camera.matrixWorld);
      rot.extractRotation(w.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rot);
      view.subVectors(mirrorPos, camPos);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(mirrorPos);
      rot.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      target.subVectors(mirrorPos, look).reflect(normal).negate().add(mirrorPos);
      const vc = self.reflectCam;
      vc.position.copy(view);
      vc.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
      vc.lookAt(target);
      vc.far = camera.far;
      vc.updateMatrixWorld();
      vc.projectionMatrix.copy(camera.projectionMatrix);
      self.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(w.matrixWorld);
      // oblique near plane: nothing below the water ends up in the reflection
      plane.setFromNormalAndCoplanarPoint(normal, mirrorPos).applyMatrix4(vc.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const e = vc.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1; e[14] = clip.w;
      const prevTarget = renderer.getRenderTarget(), prevShadow = renderer.shadowMap.autoUpdate;
      self.inReflection = true;
      w.visible = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(self.reflectRT);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
      renderer.render(scene, vc);
      renderer.setRenderTarget(prevTarget);
      renderer.shadowMap.autoUpdate = prevShadow;
      w.visible = true;
      self.inReflection = false;
    };
    if (this.lookId) this.setLook(this.lookId, { keepCamera: true });
  }

  disableReflections() {
    if (!this.waterFancy) return;
    this.water.onBeforeRender = () => {};
    this.water.material = this.waterSimple;
    this.waterFancy.dispose(); this.reflectRT.dispose();
    this.waterFancy = this.reflectRT = null;
  }

  /** A visible cone of light from above plus dust floating in it. */
  buildBeam() {
    const g = new THREE.Group();
    const h = 330, top = 6, bottom = 92;
    const geo = new THREE.CylinderGeometry(top, bottom, h, 48, 1, true);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color("#ffe6bf") }, strength: { value: 0.55 } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
        void main() { vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float strength; varying float vY; varying vec3 vN; varying vec3 vV;
        void main() { float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2); float fade = smoothstep(0.0, 0.35, vY) * (0.35 + 0.65 * vY);
          gl_FragColor = vec4(color * strength * edge * fade, 1.0); }`,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.y = FEET + h / 2 - 2;
    this.disposables.push(geo, mat);
    g.add(cone);
    const N = 160, r = rng(23), pos = new Float32Array(N * 3);
    this.dust = [];
    for (let i = 0; i < N; i++) {
      const y = r(), rad = (top + (bottom - top) * (1 - y)) * Math.sqrt(r()) * 0.85, a = r() * Math.PI * 2;
      const p = [Math.cos(a) * rad, FEET + y * h, Math.sin(a) * rad];
      this.dust.push([...p, r() * 10]);
      pos.set(p, i * 3);
    }
    const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dm = new THREE.PointsMaterial({ color: "#fff1d6", size: 1.4, map: this.glowTex(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dustPoints = new THREE.Points(dg, dm);
    this.disposables.push(dg, dm);
    g.add(this.dustPoints);
    // the spotlight that makes the hard shadow
    const spot = new THREE.SpotLight();
    spot.position.set(0, FEET + h, 0);
    spot.target.position.set(0, FEET, 0);
    spot.castShadow = true;
    const map = this.quality === "high" ? 2048 : 1024;
    spot.shadow.mapSize.set(map, map);
    spot.shadow.bias = -0.0003; spot.shadow.normalBias = 0.4;
    spot.shadow.camera.near = 40; spot.shadow.camera.far = h + 40;
    this.spot = spot;
    g.add(spot, spot.target);
    return g;
  }

  glowTex() {
    if (!this.glowT) { this.glowT = glowTexture(); this.disposables.push(this.glowT); }
    return this.glowT;
  }

  set(name) {
    if (!this.sets[name]) {
      const g = name === "roomWhite" ? this.buildRoom(true) : name === "roomDark" ? this.buildRoom(false) : name === "land" ? this.buildLand()
        : name === "beam" ? this.buildBeam() : null;
      g.visible = false;
      this.root.add(g);
      this.sets[name] = g;
      // only now: switching on reflections re-applies the look, which must find this set already built
      if (name === "land" && this.quality === "high") this.enableReflections();
    }
    return this.sets[name];
  }

  // ---------- public ----------
  setLook(id, { keepCamera = false } = {}) {
    const look = LOOKS[id] || LOOKS["mc-white"];
    this.lookId = id;
    const v = this.viewer, r = v.renderer;
    for (const g of Object.values(this.sets)) g.visible = false;
    this.set(look.set).visible = true;
    if (look.face !== undefined && !keepCamera) {
      // start with the sun in view, a little beside the figure
      const v0 = this.viewer, dist = v0.camera.position.distanceTo(v0.controls.target);
      const cam = v0.camera, halfW = Math.atan(Math.tan(cam.fov * Math.PI / 360) * cam.aspect);
      // the light sits diagonally left behind the figure
      const a = look.face + Math.PI - Math.min(0.3, halfW * 0.45);
      v0.camera.position.set(Math.sin(a), 0.16, Math.cos(a)).normalize().multiplyScalar(dist).add(v0.controls.target);
      v0.controls.update();
    }
    if (look.spot) this.set("beam").visible = true;
    r.toneMappingExposure = look.exposure;
    const u = this.sky.material.uniforms, s = look.sky;
    u.top.value.set(s.top); u.horizon.value.set(s.horizon); u.bottom.value.set(s.bottom);
    u.sunDir.value.copy(s.sun); u.sunColor.value.set(s.sunColor); u.sunSize.value = s.sunSize; u.glow.value = s.glow;
    u.stars.value = s.stars || 0; u.moon.value = s.moon || 0;
    v.scene.fog = new THREE.Fog(look.fog[0], look.fog[1], look.fog[2]);
    this.hemi.color.set(look.hemi[0]); this.hemi.groundColor.set(look.hemi[1]); this.hemi.intensity = look.hemi[2];
    if (look.key) {
      this.key.visible = true;
      this.key.color.set(look.key.color); this.key.intensity = look.key.intensity;
      this.key.position.copy(look.key.dir).multiplyScalar(420).add(this.key.target.position);
    } else this.key.visible = false;
    if (look.spot && this.spot) {
      this.spot.color.set(look.spot.color); this.spot.intensity = look.spot.intensity;
      this.spot.angle = look.spot.angle; this.spot.penumbra = look.spot.penumbra; this.spot.distance = 0; this.spot.decay = 0;
    }
    // skinview3d's own lights: a little camera light keeps the figure readable from every side
    this.fillLight.intensity = look.fill;
    this.fillLight.color.set(look.fillColor || "#fff4e6");
    v.globalLight.intensity = look.player[0];
    v.cameraLight.intensity = look.player[1];
    this.applyBloom(look);
    if (this.waterFancy) {
      const u = this.waterFancy.uniforms;
      u.sunDir.value.copy(s.sun); u.sunColor.value.set(s.sunColor);
      u.waterColor.value.set(look.water ? look.water[0] : "#1f4f80"); u.light.value = look.water ? look.water[1] : 1; u.spec.value = look.water ? look.water[2] : 2;
      u.fogColor.value.set(look.fog[0]); u.fogNear.value = look.fog[1]; u.fogFar.value = look.fog[2];
    }
    // light shafts: real screen-space rays when available, else a soft sprite around the sun
    if (this.godRays) {
      this.godRays.enabled = !!look.rays;
      if (look.rays) { this.godRays.uniforms.color.value.set(look.rays.color); this.godRays.uniforms.strength.value = look.rays.strength; }
    }
    if (look.rays && look.rays.sprite && !this.godRays) {
      if (!this.rays) {
        this.raysTex = raysTexture();
        this.rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.raysTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.38, fog: false }));
        this.rays.scale.set(1300, 1300, 1);
        this.disposables.push(this.raysTex, this.rays.material);
        this.root.add(this.rays);
      }
      this.rays.position.copy(s.sun).multiplyScalar(1500);
      this.rays.visible = true;
    } else if (this.rays) this.rays.visible = false;
    r.shadowMap.needsUpdate = true;
    this.syncWeather();
  }

  // ---------- weather: rain, snow, fireflies, falling leaves (only outdoors) ----------
  /** type: "clear" | "rain" | "snow" | "fireflies" | "leaves" */
  setWeather(type) {
    this.weatherType = type;
    this.syncWeather();
  }
  syncWeather() {
    const type = this.weatherType || "clear";
    const outdoors = LOOKS[this.lookId] && LOOKS[this.lookId].set === "land";
    if (this.weather && this.weather.type !== type) {
      this.root.remove(this.weather.obj);
      this.weather.obj.geometry.dispose(); this.weather.obj.material.dispose();
      this.weather = null;
    }
    if (type === "clear") return;
    if (!this.weather) this.weather = this.buildWeather(type);
    this.weather.obj.visible = !!outdoors;
  }
  buildWeather(type) {
    const R = 46, top = FEET + 60, bottom = FEET - 2, r = rng(type.length * 977);
    const count = { rain: 2400, snow: 1600, fireflies: 110, leaves: 220 }[type];
    const parts = [];
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R;
      parts.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: bottom + r() * (top - bottom), p: r() * 100, s: 0.7 + r() * 0.6 });
    }
    let obj;
    if (type === "rain") {
      // thin streaks: a line per drop, a little slanted by the wind
      const pos = new Float32Array(count * 6);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      obj = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: "#aebfdc", transparent: true, opacity: 0.5, depthWrite: false }));
    } else {
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const leafCols = ["#4f8738", "#6b9a3a", "#a8842d", "#c0602a"].map(c => new THREE.Color(c));
      parts.forEach((q, i) => {
        const c = type === "snow" ? new THREE.Color("#ffffff") : type === "fireflies" ? new THREE.Color("#d8ff6a") : leafCols[i % 4];
        col.set([c.r, c.g, c.b], i * 3);
        if (type === "fireflies") { q.y = FEET + 2 + r() * 14; q.x *= 0.6; q.z *= 0.6; }
      });
      obj = new THREE.Points(g, new THREE.PointsMaterial({
        size: { snow: 0.9, fireflies: 1.5, leaves: 0.9 }[type], vertexColors: true, transparent: true, depthWrite: false,
        map: type === "leaves" ? null : this.glowTex(), opacity: type === "snow" ? 0.95 : 1,
        blending: type === "fireflies" ? THREE.AdditiveBlending : THREE.NormalBlending, fog: type !== "fireflies",
      }));
    }
    obj.frustumCulled = false;
    obj.renderOrder = 2;
    this.root.add(obj);
    const w = { type, obj, parts, top, bottom, R };
    this.updateWeather(w, 0, 0);
    return w;
  }
  updateWeather(w, t, dt) {
    const a = w.obj.geometry.attributes.position, still = reduce();
    const fall = { rain: 95, snow: 7, fireflies: 0, leaves: 5 }[w.type] * (still ? 0 : 1);
    w.parts.forEach((q, i) => {
      if (w.type === "fireflies") {
        const x = q.x + Math.sin(t * 0.4 * q.s + q.p) * 3, y = q.y + Math.sin(t * 0.7 * q.s + q.p * 2) * 1.5, z = q.z + Math.cos(t * 0.33 * q.s + q.p) * 3;
        a.setXYZ(i, x, y, z);
        // blink: brightness through the colour
        const c = w.obj.geometry.attributes.color, glow = still ? 0.8 : Math.max(0, Math.sin(t * 1.7 * q.s + q.p)) ** 2;
        c.setXYZ(i, 0.85 * glow, 1 * glow, 0.42 * glow);
        return;
      }
      q.y -= fall * q.s * dt;
      if (q.y < w.bottom) q.y += w.top - w.bottom;
      const sway = w.type === "snow" ? Math.sin(t * 0.8 + q.p) * 1.2 : w.type === "leaves" ? Math.sin(t * 1.4 + q.p) * 2.2 : 0;
      if (w.type === "rain") {
        a.setXYZ(i * 2, q.x, q.y, q.z);
        a.setXYZ(i * 2 + 1, q.x + 0.25, q.y + 2.6, q.z + 0.1);
      } else a.setXYZ(i, q.x + sway, q.y, q.z + sway * 0.4);
    });
    a.needsUpdate = true;
    if (w.type === "fireflies") w.obj.geometry.attributes.color.needsUpdate = true;
  }

  /** Per-frame motion (dust, stars, rays) and the automatic quality fallback. */
  tick() {
    if (this.inReflection) return; // the mirror pass renders the scene a second time
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    const cam = this.viewer.camera;
    this.sky.position.copy(cam.position);
    if (this.godRays && this.godRays.enabled) {
      // where the sun (or moon) is on screen; fade the rays out when it is far outside the picture or behind us
      const u = this.godRays.uniforms, p = this.sunScreen || (this.sunScreen = new THREE.Vector3());
      p.copy(this.sky.material.uniforms.sunDir.value).multiplyScalar(1000).add(cam.position).project(cam);
      const away = Math.max(Math.abs(p.x), Math.abs(p.y));
      u.sun.value.set((p.x + 1) / 2, (p.y + 1) / 2);
      u.aspect.value = cam.aspect;
      const look = LOOKS[this.lookId];
      u.strength.value = p.z > 1 ? 0 : (look.rays ? look.rays.strength : 0) * (1 - Math.min(1, Math.max(0, (away - 0.9) / 0.9)));
    }
    if (this.weather && this.weather.obj.visible) this.updateWeather(this.weather, t, dt);
    if (!reduce()) {
      this.sky.material.uniforms.time.value = t;
      if (this.waterFancy) this.waterFancy.uniforms.time.value = t;
      if (this.rays && this.rays.visible) this.rays.material.rotation = t * 0.02;
      if (this.dustPoints && this.dustPoints.parent.visible) {
        const a = this.dustPoints.geometry.attributes.position;
        this.dust.forEach(([x, y, z, p], i) => a.setXYZ(i, x + Math.sin(t * 0.3 + p) * 4, y + Math.sin(t * 0.17 + p * 2) * 6, z + Math.cos(t * 0.25 + p) * 4));
        a.needsUpdate = true;
      }
    }
    // drop to the cheap path if the device cannot keep up (checked once, after the first seconds)
    if (this.quality === "high" && !this.fixedQuality && this.frames < 150) {
      this.frames++;
      if (this.frames > 30 && dt > 0.045) this.slow++;
      if (this.frames === 150 && this.slow > 60) this.lower();
    }
  }

  lower() { this.setQuality("low"); }

  /** "high": bloom, light shafts, reflective water, big shadow maps. "low": none of these, smaller shadows. */
  setQuality(q, fixed = this.fixedQuality) {
    this.fixedQuality = fixed;
    if (q === this.quality && this.qualityApplied) return;
    this.quality = q; this.qualityApplied = true;
    const r = this.viewer.renderer, high = q === "high";
    if (high) { this.addBloom(); this.addRays(); this.enableReflections(); }
    else { this.removeBloom(); this.removeRays(); this.disableReflections(); }
    const size = high ? 2048 : 1024;
    for (const l of [this.key, this.spot]) {
      if (!l || l.shadow.mapSize.x === size) continue;
      l.shadow.mapSize.set(size, size);
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
    const ratio = high ? this.saved.pixelRatio : Math.min(this.saved.pixelRatio, 1.5);
    if (r.getPixelRatio() !== ratio) { r.setPixelRatio(ratio); this.viewer.updateComposerSize(); }
    r.shadowMap.needsUpdate = true;
  }

  /** Take the world out of the scene, restore the viewer as skinview3d set it up, free GPU memory. */
  dispose() {
    const v = this.viewer, r = v.renderer, s = this.saved;
    if (this.weather) { this.weather.obj.geometry.dispose(); this.weather.obj.material.dispose(); this.weather = null; }
    v.scene.onBeforeRender = () => {};
    if (this.restoreControls) this.restoreControls();
    v.scene.remove(this.root);
    v.camera.remove(this.fillLight);
    v.scene.fog = null;
    this.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.shadow && o.shadow.map) o.shadow.dispose(); });
    for (const d of this.disposables) d.dispose();
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.lookId = null;
    this.removeRays();
    this.disableReflections();
    this.removeBloom();
    v.composer.removePass(this.output);
    this.output.dispose();
    if (this.hdr) this.setTargetType(s.rtType);
    r.toneMapping = s.toneMapping; r.toneMappingExposure = s.exposure;
    r.shadowMap.enabled = s.shadows; r.shadowMap.type = s.shadowType;
    if (r.getPixelRatio() !== s.pixelRatio) { r.setPixelRatio(s.pixelRatio); v.updateComposerSize(); }
    this.player(false);
    v.globalLight.intensity = s.amb; v.cameraLight.intensity = s.cam;
    v.autoRotate = s.autoRotate;
    Object.assign(v.controls, { minPolarAngle: s.ctl.min, maxPolarAngle: s.ctl.max, maxDistance: s.ctl.maxD, minDistance: s.ctl.minD, autoRotate: s.ctl.autoRotate, autoRotateSpeed: s.ctl.speed });
    const dist = v.camera.position.distanceTo(v.controls.target);
    v.controls.target.set(0, 0, 0);
    v.camera.position.set(0, 0, dist);
    v.controls.update();
    this.sets = {}; this.textures.clear(); this.materials.clear(); this.disposables = [];
  }
}

function dedupe(cells) {
  const m = new Map();
  for (const c of cells) m.set(c[1] + "," + c[2] + "," + c[3], c);
  return [...m.values()];
}

/** Our block drawings, for tests and texture sheets. */
export const BLOCK_TEXTURES = TEX;
