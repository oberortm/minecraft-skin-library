// Equipment for the presentation figure: elytra, armour and items in the hands.
// Textures are drawn here by default; when the user picked Minecraft's own textures or a pack
// (js/pack.js), those are used instead. The choice is remembered for all skins.

const KEY = "skin-library-equipment";

export function defaultEquipment() {
  return { elytra: false, armor: {} };
}
export function loadEquipment() {
  const e = defaultEquipment();
  try { Object.assign(e, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (err) { /* ignore */ }
  if (!e.armor || typeof e.armor !== "object") e.armor = {};
  for (const s of ARMOR_SLOTS) {
    const p = Object.assign(emptyPiece(), e.armor[s] || {});
    if (p.mat && !ARMOR_MATS.includes(p.mat)) p.mat = null;
    if (p.trim && !TRIM_PATTERNS.includes(p.trim)) p.trim = null;
    if (!TRIM_MATS[p.trimMat]) p.trimMat = "gold";
    e.armor[s] = p;
  }
  // the game does not allow both on the back: an elytra replaces the chestplate
  if (e.elytra) e.armor.chest.mat = null;
  return e;
}
export function saveEquipment(e) {
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch (err) { /* ignore */ }
}

// ---------- drawing helpers ----------
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

/**
 * Our own elytra texture (64x32, wings at 22,0 like the game's layout): grey-violet membrane,
 * darker feather lines towards the tips. Original drawing, not taken from the game.
 */
export function drawElytra() {
  const [c, ctx] = canvas(64, 32), r = rng(7);
  for (let y = 0; y < 22; y++) for (let x = 22; x < 46; x++) {
    const fx = (x - 22) % 12, tip = y / 22;
    let v = 0.78 + r() * 0.08 - tip * 0.18;
    if (fx % 3 === 0 && y > 3) v -= 0.12;          // feather lines
    if (y > 17 && (x + y) % 2 === 0) v -= 0.08;     // ragged lower edge
    const R = Math.round(140 * v), G = Math.round(136 * v), B = Math.round(168 * v);
    ctx.fillStyle = `rgb(${R},${G},${B})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** Put the elytra on or take it off. pack: { elytra: canvas } from the selected texture source, or null. */
export async function applyElytra(viewer, on, pack) {
  if (!on) { viewer.resetCape(); return; }
  await viewer.loadCape((pack && pack.elytra) || drawElytra(), { backEquipment: "elytra" });
}

// ---------- armour ----------
export const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];
export const ARMOR_MATS = ["leather", "chainmail", "iron", "gold", "copper", "diamond", "netherite"];
export const TRIM_PATTERNS = ["sentry", "dune", "coast", "wild", "ward", "eye", "vex", "tide", "snout", "rib", "spire", "wayfinder", "shaper", "silence", "raiser", "host", "flow", "bolt"];
export const TRIM_MATS = { quartz: "#e3d4c6", iron: "#cfcbca", netherite: "#5a4c4c", redstone: "#b0190a", copper: "#c4704f", gold: "#e6be3a", emerald: "#17c544", diamond: "#6eecd2", lapis: "#3f69b8", amethyst: "#a46fd8", resin: "#fc8c25" };

export function emptyPiece() { return { mat: null, trim: null, trimMat: "gold", glint: false, dye: "#a06540" }; }

/** Colours of our own armour drawings: [base, light, dark]. */
const MAT_COLORS = {
  leather: ["#a06540", "#c28156", "#6e4127"], chainmail: ["#8f9399", "#c3c7cc", "#4b4f55"], iron: ["#cfd2d6", "#f2f4f6", "#8e9298"],
  gold: ["#e8c13f", "#fbe878", "#a8801c"], copper: ["#c96f4c", "#e99474", "#874230"], diamond: ["#4fd9cf", "#a9f6ef", "#2a8f8a"],
  netherite: ["#4a4446", "#6b6365", "#2b2628"],
};

/**
 * Which pixels of the 64x32 armour layout are covered, per slot, in our own drawings.
 * Layer 1 (helmet, chestplate, boots) and layer 2 (leggings) use the old skin layout:
 * head 0,0 (8x8x8), body 16,16 (8x12x4), arm 40,16 (4x12x4), leg 0,16 (4x12x4).
 */
function coverage(slot) {
  const rects = [];
  const box = (u, v, w, h, d, rows) => {
    // rows(y) -> true where the side faces are covered (y counted from the top of the box)
    for (let y = 0; y < h; y++) if (rows(y)) {
      rects.push([u, v + d + y, d, 1], [u + d, v + d + y, w, 1], [u + d + w, v + d + y, d, 1], [u + 2 * d + w, v + d + y, w, 1]);
    }
  };
  if (slot === "head") {
    rects.push([8, 0, 8, 8], [16, 0, 8, 8]);                             // top, bottom rim
    box(0, 0, 8, 8, 8, y => y < 3);                                      // band all round
    rects.push([0, 8, 8, 8], [24, 8, 8, 8]);                              // both sides and the back fully
    rects.push([8, 11, 1, 5], [15, 11, 1, 5]);                            // cheek guards beside the face
  } else if (slot === "chest") {
    box(16, 16, 8, 12, 4, y => y < 11);
    rects.push([20, 16, 8, 4]);                                           // shoulders top
    box(40, 16, 4, 12, 4, y => y < 5);                                    // shoulder pads
    rects.push([44, 16, 4, 4]);
  } else if (slot === "legs") {
    box(16, 16, 8, 12, 4, y => y >= 7);                                   // hips
    box(0, 16, 4, 12, 4, y => y < 9);
  } else if (slot === "feet") {
    box(0, 16, 4, 12, 4, y => y >= 8);
    rects.push([8, 16, 4, 4]);                                            // soles
  }
  return rects;
}

/** Our own armour texture for one slot and material (64x32). */
function drawArmor(slot, mat, dye) {
  const [c, ctx] = canvas(64, 32), r = rng(ARMOR_MATS.indexOf(mat) * 31 + slot.length);
  let [base, light, dark] = MAT_COLORS[mat];
  if (mat === "leather" && dye) { base = dye; light = shadeHex(dye, 1.2); dark = shadeHex(dye, 0.65); }
  const cov = coverage(slot);
  for (const [x, y, w, h] of cov) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = x + i, py = y + j;
      let col = base;
      if (mat === "chainmail") col = (px + py) % 2 ? dark : (r() < 0.5 ? base : light);
      else if (r() < 0.12) col = light;
      else if (r() < 0.08) col = dark;
      ctx.fillStyle = col; ctx.fillRect(px, py, 1, 1);
    }
  }
  // darker outline along the lower edge of each covered band, lighter along the upper edge
  for (const [x, y, w, h] of cov) {
    ctx.fillStyle = dark; ctx.fillRect(x, y + h - 1, w, 1);
  }
  return c;
}
function shadeHex(h, f) {
  const n = parseInt(h.slice(1), 16), ch = s => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** Our own trim drawing: a different simple ornament per pattern, coloured with the trim material. */
function drawTrim(slot, pattern, color) {
  const [c, ctx] = canvas(64, 32), k = TRIM_PATTERNS.indexOf(pattern);
  const hit = (x, y) => {
    switch (k % 6) {
      case 0: return y % 4 === 0;                       // bands
      case 1: return (x + y) % 5 === 0;                  // diagonals
      case 2: return (x % 4 === 1) && (y % 3 !== 2);     // studs in columns
      case 3: return Math.abs(((x % 8) - 3.5)) + (y % 6) === 5.5; // chevrons
      case 4: return x % 6 === 0 || y % 6 === 0;          // grid
      default: return (x * 3 + y * 7 + k) % 11 === 0;     // scattered marks
    }
  };
  ctx.fillStyle = color;
  for (const [x, y, w, h] of coverage(slot)) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (hit(x + i + k, y + j)) ctx.fillRect(x + i, y + j, 1, 1);
  }
  return c;
}

/** Recolour a vanilla grayscale trim with the game's palettes (key palette -> material palette). */
function paletteTrim(trim, key, pal) {
  const [c, ctx] = canvas(trim.width, trim.height);
  ctx.drawImage(trim, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const read = cv => cv.getContext("2d").getImageData(0, 0, cv.width, 1).data;
  const kd = read(key), pd = read(pal), map = new Map();
  for (let i = 0; i < key.width; i++) map.set((kd[i * 4] << 16) | (kd[i * 4 + 1] << 8) | kd[i * 4 + 2], [pd[i * 4], pd[i * 4 + 1], pd[i * 4 + 2]]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const m = map.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (m) { d[i] = m[0]; d[i + 1] = m[1]; d[i + 2] = m[2]; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function tint(src, color) {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(src, 0, 0);
  return c;
}

/** The finished texture for one worn piece: material (+ dye) with the trim on top. */
function pieceTexture(slot, piece, pack) {
  const layer2 = slot === "legs";
  const src = pack && pack[(layer2 ? "armor2_" : "armor_") + piece.mat];
  let base;
  if (src) {
    base = piece.mat === "leather" ? tint(src, piece.dye) : src;
    const over = pack[(layer2 ? "armor2_" : "armor_") + "leather_overlay"];
    if (piece.mat === "leather" && over) { const [c, ctx] = canvas(base.width, base.height); ctx.drawImage(base, 0, 0); ctx.drawImage(over, 0, 0, base.width, base.height); base = c; }
  } else base = drawArmor(slot, piece.mat, piece.dye);
  if (!piece.trim) return base;
  const tsrc = pack && pack[(layer2 ? "trim2_" : "trim_") + piece.trim];
  let trim;
  if (tsrc && pack.pal_key && pack["pal_" + piece.trimMat]) trim = paletteTrim(tsrc, pack.pal_key, pack["pal_" + piece.trimMat]);
  else if (tsrc) trim = tint(tsrc, TRIM_MATS[piece.trimMat]);
  else trim = drawTrim(slot, piece.trim, TRIM_MATS[piece.trimMat]);
  const [c, ctx] = canvas(base.width, base.height);
  ctx.drawImage(base, 0, 0);
  // vanilla only draws trims where the armour is; keep that by masking with the base
  const [m, mctx] = canvas(base.width, base.height);
  mctx.drawImage(trim, 0, 0, base.width, base.height);
  mctx.globalCompositeOperation = "destination-in"; mctx.drawImage(base, 0, 0);
  ctx.drawImage(m, 0, 0);
  return c;
}

/** A purple enchantment shimmer texture (our own drawing): soft diagonal streaks. */
export function drawGlint() {
  const [c, ctx] = canvas(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = Math.max(0, Math.sin((x + y * 0.6) / 64 * Math.PI * 4)) ** 3 * 0.9 + Math.max(0, Math.sin((x * 0.4 - y) / 64 * Math.PI * 6)) ** 4 * 0.5;
    ctx.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(80 * v)},${Math.round(230 * v)})`;
    ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

function boxUVs(geo, u, v, w, h, d, tw, th) {
  const f = (x1, y1, x2, y2) => [[x1 / tw, 1 - y2 / th], [x2 / tw, 1 - y2 / th], [x2 / tw, 1 - y1 / th], [x1 / tw, 1 - y1 / th]];
  const top = f(u + d, v, u + w + d, v + d), bottom = f(u + w + d, v, u + 2 * w + d, v + d);
  const left = f(u, v + d, u + d, v + d + h), front = f(u + d, v + d, u + w + d, v + d + h);
  const right = f(u + w + d, v + d, u + w + 2 * d, v + h + d), back = f(u + w + 2 * d, v + d, u + 2 * w + 2 * d, v + h + d);
  const order = [[right[3], right[2], right[0], right[1]], [left[3], left[2], left[0], left[1]], [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]], [front[3], front[2], front[0], front[1]], [back[3], back[2], back[0], back[1]]];
  geo.attributes.uv.set(new Float32Array(order.flat(2)));
  geo.attributes.uv.needsUpdate = true;
}

/** Remove everything this module attached to the figure. */
function clearArmor(viewer) {
  const old = viewer.playerObject.userData.armor || [];
  for (const m of old) {
    m.parent && m.parent.remove(m);
    m.geometry.dispose();
    [].concat(m.material).forEach(x => { if (x.map && x.map.userData.own) x.map.dispose(); x.dispose(); });
  }
  viewer.playerObject.userData.armor = [];
}

/**
 * Dress the figure. armor: { head|chest|legs|feet: piece }, pack: textures of the selected source.
 * Pieces hang on skinview3d's body parts, so they follow every animation.
 */
export function applyArmor(viewer, THREE, armor, pack) {
  clearArmor(viewer);
  const skin = viewer.playerObject.skin, list = viewer.playerObject.userData.armor, slim = skin.slim;
  const glintTex = new THREE.CanvasTexture((pack && pack.glint_entity) || drawGlint());
  glintTex.wrapS = glintTex.wrapT = THREE.RepeatWrapping; glintTex.userData.own = true;
  const texCache = new Map();
  const tex = (cv, color) => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.userData.own = true; t.userData.equipment = color;
    return t;
  };
  const texFor = (slot, piece) => {
    const k = slot + JSON.stringify(piece);
    if (!texCache.has(k)) {
      const cv = pieceTexture(slot, piece, pack);
      // white where the armour is: limits the shimmer to the armour
      const [m, mctx] = canvas(cv.width, cv.height);
      mctx.drawImage(cv, 0, 0); mctx.globalCompositeOperation = "source-in"; mctx.fillStyle = "#fff"; mctx.fillRect(0, 0, m.width, m.height);
      texCache.set(k, [tex(cv, true), tex(m, false)]);
    }
    return texCache.get(k);
  };
  // [slot, body part, parent (part or its pivot), box u v w h d, inflate, position, mirrored]
  const pivot = part => part.children.find(o => o.isGroup) || part;
  const armX = slim ? 0.5 : 0;
  const pieces = [
    ["head", skin.head, skin.head, [0, 0, 8, 8, 8], 1, [0, 4, 0], false],
    ["chest", skin.body, skin.body, [16, 16, 8, 12, 4], 1, [0, 0, 0], false],
    ["chest", skin.rightArm, pivot(skin.rightArm), [40, 16, 4, 12, 4], 1, [-armX, 0, 0], false],
    ["chest", skin.leftArm, pivot(skin.leftArm), [40, 16, 4, 12, 4], 1, [armX, 0, 0], true],
    ["legs", skin.body, skin.body, [16, 16, 8, 12, 4], 0.5, [0, 0, 0], false],
    ["legs", skin.rightLeg, pivot(skin.rightLeg), [0, 16, 4, 12, 4], 0.5, [0, 0, 0], false],
    ["legs", skin.leftLeg, pivot(skin.leftLeg), [0, 16, 4, 12, 4], 0.5, [0, 0, 0], true],
    ["feet", skin.rightLeg, pivot(skin.rightLeg), [0, 16, 4, 12, 4], 1, [0, 0, 0], false],
    ["feet", skin.leftLeg, pivot(skin.leftLeg), [0, 16, 4, 12, 4], 1, [0, 0, 0], true],
  ];
  for (const [slot, , parent, [u, v, w, h, d], inf, pos, mirror] of pieces) {
    const piece = armor && armor[slot];
    if (!piece || !piece.mat) continue;
    const geo = new THREE.BoxGeometry(w + inf * 2, h + inf * 2, d + inf * 2);
    boxUVs(geo, u, v, w, h, d, 64, 32);
    const [map, mask] = texFor(slot, piece);
    const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.6, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    if (mirror) mesh.scale.x = -1;
    mesh.castShadow = true;
    parent.add(mesh); list.push(mesh);
    if (piece.glint) {
      // the shimmer: same box, additive, sliding texture; masked to the armour by alpha test of the base
      const g = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ map: glintTex, alphaMap: mask, alphaTest: 0.1, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      g.position.copy(mesh.position); g.scale.copy(mesh.scale).multiplyScalar(1.004);
      g.onBeforeRender = () => { glintTex.offset.set((performance.now() / 9000) % 1, (performance.now() / 14000) % 1); };
      parent.add(g); list.push(g);
    }
  }
}
