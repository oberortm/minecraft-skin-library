// Minecraft-style block worlds for the presentation, built into the skinview3d scene.
// Everything is generated here: block textures are 16x16 pixel noise drawn on a canvas, the sky is a
// shader, no game assets. The player model stays skinview3d's; the world only adds blocks, light,
// shadows, fog, bloom and ACES tone mapping around it, and removes all of that again on dispose().
import * as THREE from "three";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

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
function valueNoise(seed) {
  const h = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return n - Math.floor(n); };
  const s = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
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

const TEX = {
  grassTop: s => paint(s, (x, y, r, n) => shade(hex("#5f9d3d"), 0.82 + r() * 0.3 + (n(x / 3, y / 3) - 0.5) * 0.18)),
  grassSide: s => paint(s, (x, y, r, n) => {
    const edge = 3 + Math.floor(n(x * 0.9, 1) * 3);
    if (y < edge) return shade(hex("#5f9d3d"), 0.8 + r() * 0.28);
    return shade(hex("#86603f"), 0.78 + r() * 0.3 + (n(x / 2, y / 2) - 0.5) * 0.2);
  }),
  dirt: s => paint(s, (x, y, r, n) => shade(hex("#86603f"), 0.76 + r() * 0.32 + (n(x / 2, y / 2) - 0.5) * 0.22)),
  stone: s => paint(s, (x, y, r, n) => shade(hex("#8b8d90"), 0.8 + r() * 0.14 + (n(x / 4, y / 3) - 0.5) * 0.35)),
  sand: s => paint(s, (x, y, r) => shade(hex("#dccf98"), 0.9 + r() * 0.14)),
  logSide: s => paint(s, (x, y, r, n) => {
    const groove = n(x * 1.7, y / 6) > 0.62 ? 0.72 : 1;
    return shade(hex("#6e5233"), (0.82 + r() * 0.2) * groove);
  }),
  logTop: s => paint(s, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return shade(hex("#6e5233"), 0.8 + r() * 0.2);
    return shade(hex("#b8925e"), (Math.floor(d) % 2 ? 0.86 : 1) * (0.92 + r() * 0.1));
  }),
  leaves: s => paint(s, (x, y, r, n) => {
    if (r() < 0.2) return [0, 0, 0, 0];
    return shade(hex("#3f7f2c"), 0.65 + r() * 0.35 + (n(x / 2, y / 2) - 0.5) * 0.3);
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
    const crack = Math.abs(n(x / 3, y / 3) - 0.5) < 0.04 ? 0.6 : 1;
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
  panel: s => paint(s, (x, y, r) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    return edge ? shade(hex("#d9d6cd"), 0.95 + r() * 0.05) : shade(hex("#fffaf0"), 0.97 + r() * 0.03);
  }),
  glowAmber: s => paint(s, (x, y, r, n) => shade(hex("#ffc163"), 0.7 + r() * 0.3 + n(x / 2, y / 2) * 0.3)),
  glowCyan: s => paint(s, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = d > 5.5 ? 0.62 : d > 3.5 ? 1.05 : 0.85;
    return shade(hex("#86e8dc"), ring * (0.88 + r() * 0.16));
  }),
  lantern: s => paint(s, (x, y, r) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 5.5) return shade(hex("#3b342e"), 0.8 + r() * 0.3);
    return shade(hex("#ffcf7a"), 0.85 + r() * 0.2);
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
        col += sunColor * (disc * (moon > 0.5 ? 1.6 : 7.0) + pow(c, 220.0) * glow * 1.6 + pow(c, 18.0) * glow * 0.45 + pow(c, 4.0) * glow * 0.12);
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
const sunAt = (azimuth, elevation) => new THREE.Vector3(
  Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));

const LOOKS = {
  "mc-white": {
    set: "roomWhite", exposure: 0.95,
    sky: { top: "#f4f5f7", horizon: "#ffffff", bottom: "#e9eaee", sun: sunAt(0.6, 1.0), sunColor: "#ffffff", sunSize: 0.0001, glow: 0 },
    fog: ["#f3f3f1", 260, 900], hemi: ["#ffffff", "#d9d6cf", 1.15],
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
    sky: { top: "#3a5a92", horizon: "#ffb27a", bottom: "#c88a6a", sun: sunAt(-2.7, 0.07), sunColor: "#ffc48a", sunSize: 0.032, glow: 1.6 },
    fog: ["#f2b48a", 180, 760], hemi: ["#a8c4ff", "#7a5236", 0.72],
    key: { dir: sunAt(-2.7, 0.2), color: "#ffb36b", intensity: 2.6 }, fill: 0.25,
    bloom: [0.55, 0.6, 0.78], player: [0.2, 0.45], rays: true,
  },
  "mc-night": {
    set: "land", exposure: 1.35,
    sky: { top: "#03060f", horizon: "#13213d", bottom: "#070b14", sun: sunAt(0.9, 0.62), sunColor: "#dfe8ff", sunSize: 0.038, glow: 0.45, stars: 1, moon: 1 },
    fog: ["#0f1a30", 160, 640], hemi: ["#4a64a8", "#120e0c", 0.45],
    key: { dir: sunAt(0.9, 0.7), color: "#9fb8ff", intensity: 0.85 }, fill: 0.1,
    bloom: [0.9, 0.6, 0.55], player: [0.12, 0.18], lanterns: true, fireflies: true,
  },
};

export class McWorld {
  constructor(viewer, quality = guessQuality()) {
    this.viewer = viewer;
    this.quality = quality;
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
    if (this.quality === "high") this.addBloom();
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
    v.playerObject.traverse(o => { if (o.isMesh) { o.castShadow = on; o.receiveShadow = false; } });
    const t = v.skinTexture;
    if (t) { t.colorSpace = on ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; }
  }
  /** Call after every loadSkin: skinview3d creates a new texture each time. */
  skinChanged() { this.player(true); }

  // ---------- blocks ----------
  texture(name) {
    if (!this.textures.has(name)) {
      const t = new THREE.CanvasTexture(TEX[name](name.length * 131 + name.charCodeAt(0)));
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4, this.viewer.renderer.capabilities.getMaxAnisotropy());
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
    const geo = new THREE.BoxGeometry(B, B, B);
    this.disposables.push(geo);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), r = rng(seed);
    for (const [type, list] of byType) {
      const f = BLOCKS[type].faces;
      const mats = (Array.isArray(f) ? f : Array(6).fill(f)).map(n => this.material(n, type));
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
  buildRoom(white) {
    // the white room is a little taller and has a ceiling with light panels
    const cells = [], R = 12, H = white ? 9 : 7;
    const floorA = white ? "quartzTile" : "darkPolished", floorB = white ? "quartz" : "dark";
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
      cells.push([(x + z) % 2 === 0 ? floorA : floorB, x, -1, z]);
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge === R) {
        for (let y = 0; y < H; y++) {
          let type = white ? "quartz" : "darkBrick";
          const corner = Math.abs(x) === R && Math.abs(z) === R;
          const pillar = corner || (Math.abs(x) % 4 === 0 && Math.abs(z) === R) || (Math.abs(z) % 4 === 0 && Math.abs(x) === R);
          if (pillar) type = white ? "pillar" : "darkPolished";
          cells.push([type, x, y, z]);
        }
      }
    }
    // plinth: the figure stands on a 3x3 platform one step above the floor
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) cells.push([white ? "pillar" : "darkPolished", x, 0, z]);
    const g = this.buildBlocks(dedupe(cells), white ? 11 : 12);
    if (white) {
      const ceiling = [];
      for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
        const lit = Math.abs(x) <= R - 2 && Math.abs(z) <= R - 2 && ((x + 64) % 4) < 2 && ((z + 64) % 4) < 2;
        ceiling.push([lit ? "panel" : "quartz", x, H, z]);
      }
      // the ceiling does not cast shadows, so the soft key light from above still reaches the floor
      g.add(this.buildBlocks(ceiling, 13, { shadows: false }));
    }
    return g;
  }

  /** A small island: grass, dirt, stone, sand at the shore, trees beyond the camera's circle, water around. */
  buildLand() {
    const cells = [], n = valueNoise(3), r = rng(5), R = 16;
    const height = (x, z) => {
      const d = Math.hypot(x, z);
      if (d <= 5.5) return 0;
      const shore = Math.max(0, (d - (R - 4.5)) / 4.5);
      const ramp = Math.min(1, (d - 5.5) / 4);
      const hills = ((n(x / 5, z / 5) - 0.4) * 2.6 + (d > 9 ? (d - 9) * 0.22 : 0)) * ramp;
      return Math.round(Math.max(-1, Math.min(4, hills * Math.max(0, 1 - shore) - shore * 2.4)));
    };
    const tops = new Map();
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
      if (Math.hypot(x, z) > R + 0.5) continue;
      const h = height(x, z);
      tops.set(x + "," + z, h);
      const shoreSand = h <= 0 && Math.hypot(x, z) > R - 5;
      for (let y = Math.min(h, -1) - 2; y <= h; y++) {
        let type = y === h ? (shoreSand ? "sand" : "grass") : y >= h - 2 ? (shoreSand ? "sand" : "dirt") : "stone";
        if (y === h && h >= 3 && n(x / 2, z / 2 + 9) > 0.55) type = "stone";
        cells.push([type, x, y, z]);
      }
    }
    // trees outside the camera's orbit so they never block the view of the figure
    const spots = [[11, 3], [-10, 8], [6, -12], [-12, -5], [3, 13], [-5, -12], [13, -6], [-13, 2]];
    for (const [x, z] of spots) {
      const h = tops.get(x + "," + z);
      if (h === undefined || h < 0) continue;
      const trunk = 4 + Math.floor(r() * 2);
      for (let y = 1; y <= trunk; y++) cells.push(["log", x, h + y, z]);
      for (let dy = trunk - 1; dy <= trunk + 2; dy++) {
        const rad = dy >= trunk + 1 ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < trunk + 1) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue;
          cells.push(["leaves", x + dx, h + dy, z + dz]);
        }
      }
    }
    // a few stones scattered near the clearing
    for (const [x, z] of [[5, 4], [-6, 3], [4, -6]]) cells.push(["stone", x, (tops.get(x + "," + z) ?? 0) + 1, z]);
    const g = this.buildBlocks(dedupe(cells), 21);
    // water: one big plane, fades into the fog
    const wt = new THREE.CanvasTexture(paint(9, (x, y, rr) => shade(hex("#3d6fb4"), 0.85 + rr() * 0.22)));
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(140, 140); wt.magFilter = THREE.NearestFilter; wt.colorSpace = THREE.SRGBColorSpace;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ map: wt, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = FEET - B - 2;
    water.receiveShadow = true;
    g.add(water);
    this.water = water;
    this.disposables.push(wt, water.geometry, water.material);
    return g;
  }

  /** Lanterns on posts around the clearing, each a warm point light with a glow. */
  buildLanterns() {
    const g = new THREE.Group(), glow = this.glowTex();
    const post = this.material("logSide", "log"), lamp = new THREE.MeshStandardMaterial({ map: this.texture("lantern"), emissive: new THREE.Color("#ffb347"), emissiveMap: this.texture("lantern"), emissiveIntensity: 3 });
    const postGeo = new THREE.BoxGeometry(4, B * 1.5, 4), lampGeo = new THREE.BoxGeometry(7, 9, 7);
    this.disposables.push(lamp, postGeo, lampGeo);
    const spots = this.quality === "high" ? [[5, 3], [-5, 2.5], [1, -5.5], [-3.5, -4.5]] : [[5, 3], [-5, 2.5], [1, -5.5]];
    for (const [x, z] of spots) {
      const p = new THREE.Mesh(postGeo, post); p.position.set(x * B, FEET + B * 0.75, z * B); p.castShadow = true;
      const l = new THREE.Mesh(lampGeo, lamp); l.position.set(x * B, FEET + B * 1.5 + 4.5, z * B);
      const light = new THREE.PointLight("#ffb05a", 2.2, 230, 2); light.position.copy(l.position);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffb35c", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85, fog: false }));
      s.position.copy(l.position); s.scale.set(26, 26, 1);
      this.disposables.push(s.material);
      g.add(p, l, light, s);
    }
    return g;
  }

  /** Fireflies drifting over the meadow at night. */
  buildFireflies() {
    const N = this.quality === "high" ? 70 : 36, r = rng(17);
    const pos = new Float32Array(N * 3);
    this.flyBase = [];
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2, d = 50 + r() * 170;
      const p = [Math.cos(a) * d, FEET + 8 + r() * 40, Math.sin(a) * d];
      this.flyBase.push([...p, r() * 10]);
      pos.set(p, i * 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: "#d8ff8a", size: 3.2, map: this.glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.disposables.push(geo, mat);
    this.flies = new THREE.Points(geo, mat);
    return this.flies;
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
        : name === "lanterns" ? this.buildLanterns() : name === "fireflies" ? this.buildFireflies() : name === "beam" ? this.buildBeam() : null;
      g.visible = false;
      this.root.add(g);
      this.sets[name] = g;
    }
    return this.sets[name];
  }

  // ---------- public ----------
  setLook(id) {
    const look = LOOKS[id] || LOOKS["mc-white"];
    this.lookId = id;
    const v = this.viewer, r = v.renderer;
    for (const g of Object.values(this.sets)) g.visible = false;
    this.set(look.set).visible = true;
    if (look.lanterns) this.set("lanterns").visible = true;
    if (look.fireflies) this.set("fireflies").visible = true;
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
    if (look.rays) {
      if (!this.rays) {
        this.raysTex = raysTexture();
        this.rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.raysTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75, fog: false }));
        this.rays.scale.set(1300, 1300, 1);
        this.disposables.push(this.raysTex, this.rays.material);
        this.root.add(this.rays);
      }
      this.rays.position.copy(s.sun).multiplyScalar(1500);
      this.rays.visible = true;
    } else if (this.rays) this.rays.visible = false;
    r.shadowMap.needsUpdate = true;
  }

  /** Per-frame motion (dust, fireflies, stars, rays) and the automatic quality fallback. */
  tick() {
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.sky.position.copy(this.viewer.camera.position);
    if (!reduce()) {
      this.sky.material.uniforms.time.value = t;
      if (this.rays && this.rays.visible) this.rays.material.rotation = t * 0.02;
      if (this.dustPoints && this.dustPoints.parent.visible) {
        const a = this.dustPoints.geometry.attributes.position;
        this.dust.forEach(([x, y, z, p], i) => a.setXYZ(i, x + Math.sin(t * 0.3 + p) * 4, y + Math.sin(t * 0.17 + p * 2) * 6, z + Math.cos(t * 0.25 + p) * 4));
        a.needsUpdate = true;
      }
      if (this.flies && this.flies.visible) {
        const a = this.flies.geometry.attributes.position;
        this.flyBase.forEach(([x, y, z, p], i) => a.setXYZ(i, x + Math.sin(t * 0.4 + p) * 14, y + Math.sin(t * 0.9 + p * 3) * 5, z + Math.cos(t * 0.35 + p) * 14));
        a.needsUpdate = true;
        this.flies.material.opacity = 0.7 + 0.3 * Math.sin(t * 2.1);
      }
    }
    // drop to the cheap path if the device cannot keep up (checked once, after the first seconds)
    if (this.quality === "high" && this.frames < 150) {
      this.frames++;
      if (this.frames > 30 && dt > 0.045) this.slow++;
      if (this.frames === 150 && this.slow > 60) this.lower();
    }
  }

  lower() {
    this.quality = "low";
    this.removeBloom();
    for (const l of [this.key, this.spot]) {
      if (!l) continue;
      l.shadow.mapSize.set(1024, 1024);
      if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
    }
    const r = this.viewer.renderer;
    if (r.getPixelRatio() > 1.25) { r.setPixelRatio(1.25); this.viewer.updateComposerSize(); }
  }

  /** Take the world out of the scene, restore the viewer as skinview3d set it up, free GPU memory. */
  dispose() {
    const v = this.viewer, r = v.renderer, s = this.saved;
    v.scene.onBeforeRender = () => {};
    v.scene.remove(this.root);
    v.camera.remove(this.fillLight);
    v.scene.fog = null;
    this.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.shadow && o.shadow.map) o.shadow.dispose(); });
    for (const d of this.disposables) d.dispose();
    for (const t of this.textures.values()) t.dispose();
    for (const m of this.materials.values()) m.dispose();
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
