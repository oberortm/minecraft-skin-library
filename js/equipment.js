// Equipment for the presentation figure: elytra, armour and items in the hands.
// Textures are drawn here by default; when the user picked Minecraft's own textures or a pack
// (js/pack.js), those are used instead. The choice is remembered for all skins.

const KEY = "skin-library-equipment";

export function defaultEquipment() {
  return { elytra: false, armor: {}, hands: {} };
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
  if (!e.hands || typeof e.hands !== "object") e.hands = {};
  for (const h of ["main", "off"]) {
    const p = Object.assign(emptyHand(), e.hands[h] || {});
    if (p.item && !(p.item in ITEMS)) p.item = null;
    if (!TOOL_MATS.includes(p.mat)) p.mat = "iron";
    e.hands[h] = p;
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

// ---------- items in the hands ----------
export const TOOL_MATS = ["wood", "stone", "copper", "iron", "gold", "diamond", "netherite"];
/** Every item, with whether it comes in tool materials. Both hands can hold any of them. */
export const ITEMS = { sword: true, axe: true, pickaxe: true, spear: true, mace: false, trident: false, bow: false, crossbow: false, shield: false, totem: false, torch: false, map: false };
export function emptyHand() { return { item: null, mat: "iron", glint: false }; }
const TOOL_COLORS = {
  wood: ["#a07a46", "#c49a5e", "#6b4f2a"], stone: ["#8a8a8a", "#ababab", "#5e5e5e"], copper: ["#c96f4c", "#ec9a78", "#874230"],
  iron: ["#d4d4d4", "#ffffff", "#8f8f8f"], gold: ["#f0cf4a", "#fff38a", "#b08a1e"], diamond: ["#4fe0d6", "#b4fff8", "#2a9a94"],
  netherite: ["#4a4446", "#6e6668", "#2b2628"],
};
const WOOD = ["#8d6a3f", "#6b4a2a", "#4a3219"];
/** Where the hand grips each 16x16 sprite (x, y in pixels). */
const GRIP = { sword: [3, 12.5], axe: [3, 12.5], pickaxe: [3, 12.5], spear: [4, 11.5], mace: [3.5, 12], trident: [4, 11.5], bow: [9.5, 9.5], crossbow: [5, 10.5], totem: [8, 13], torch: [8, 14], map: [8, 12] };

/** File names in the game's textures (new names, then 1.8-1.12). */
export function itemFiles() {
  const out = {}, old = { wood: "wood", stone: "stone", copper: "copper", iron: "iron", gold: "gold", diamond: "diamond", netherite: "netherite" };
  const nw = { wood: "wooden", stone: "stone", copper: "copper", iron: "iron", gold: "golden", diamond: "diamond", netherite: "netherite" };
  for (const m of TOOL_MATS) for (const it of ["sword", "axe", "pickaxe", "spear"]) {
    out[`item_${it}_${m}`] = [[`item/${nw[m]}_${it}`, `items/${old[m]}_${it}`]];
  }
  Object.assign(out, {
    item_mace: [["item/mace"]], item_trident: [["item/trident"]], item_bow: [["item/bow", "items/bow_standby"]],
    item_crossbow: [["item/crossbow_standby"]], item_totem: [["item/totem_of_undying", "items/totem"]],
    item_torch: [["block/torch", "blocks/torch_on"]], item_map: [["item/map", "items/map_empty"]],
    shield: [["entity/shield/shield_base_nopattern", "entity/shield_base_nopattern"]],
  });
  return out;
}

/** Our own 16x16 item drawings. Shapes follow the usual diagonal (handle bottom left, tip top right). */
function drawItem(item, mat) {
  const [c, ctx] = canvas(16, 16), r = rng(item.length * 7 + 3);
  const px = (x, y, col) => { if (x >= 0 && y >= 0 && x < 16 && y < 16) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } };
  const [m, M, d] = TOOL_COLORS[mat] || TOOL_COLORS.iron;
  const handle = (x0, x1) => { for (let x = x0; x <= x1; x++) { px(x, 15 - x, WOOD[0]); px(x + 1, 15 - x, WOOD[1]); } };
  switch (item) {
    case "sword":
      for (let x = 5; x <= 15; x++) { px(x, 15 - x, M); px(x, 16 - x, m); px(x, 17 - x, d); }
      px(15, 0, M); px(15, 1, d);
      handle(1, 3); px(0, 15, d); px(1, 15, d); px(0, 14, d);
      for (let k = -3; k <= 2; k++) px(5 + k, 11 + k, k === 0 ? M : d);
      break;
    case "pickaxe":
      handle(1, 9);
      for (let k = -6; k <= 6; k++) {
        const b = Math.abs(k) >= 4 ? 1 : 0, x = 9 + k - b, y = 6 + k + b - 2 * b * Math.sign(k) * 0;
        px(x, y, Math.abs(k) >= 5 ? d : m); px(x + 1, y - 1, Math.abs(k) <= 3 ? M : m);
      }
      break;
    case "axe":
      handle(1, 10);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const s = x - y, dist = 15 - (x + y);
        if (s >= -1 && s <= 7 && dist >= 1 && dist <= 5 && !(dist === 5 && (s <= 0 || s >= 6))) px(x, y, dist === 5 || dist === 4 && (s === -1 || s === 7) ? M : dist === 1 ? d : m);
      }
      break;
    case "spear":
      for (let x = 0; x <= 11; x++) { px(x, 15 - x, x % 3 ? WOOD[0] : WOOD[1]); }
      for (let y = 0; y <= 5; y++) for (let x = 10; x < 16; x++) {
        const w = x <= 11 ? 1 : x <= 13 ? 1 : 0, dd = x + y - 15;
        if (Math.abs(dd) <= w && (x >= 11 || dd === 0)) px(x, y, dd < 0 ? M : dd > 0 ? d : m);
      }
      px(10, 5, d); px(11, 6, d); px(9, 4, d);
      break;
    case "mace":
      handle(2, 7); px(1, 14, "#3a3a3a"); px(2, 14, "#3a3a3a");
      for (let y = 2; y <= 7; y++) for (let x = 8; x <= 13; x++) px(x, y, (x + y) % 3 ? "#5b5b5f" : "#46464a");
      for (const [x, y] of [[8, 2], [13, 2], [8, 7], [13, 7], [10, 1], [11, 1], [14, 4], [14, 5], [10, 8], [11, 8], [7, 4], [7, 5]]) px(x, y, "#a5a5ac");
      px(10, 4, "#c9b26a"); px(11, 5, "#c9b26a");
      break;
    case "trident": {
      const T = ["#3f8c7c", "#7cc9b4", "#245a4f"];
      for (let x = 0; x <= 15; x++) { px(x, 15 - x, x > 11 ? T[1] : T[0]); if (x <= 11) px(x + 1, 15 - x, T[2]); }
      for (const [x, y] of [[9, 2], [10, 3], [12, 5], [13, 6], [10, 1], [11, 0], [14, 5], [15, 4]]) px(x, y, T[1]);
      px(11, 4, T[2]);
      break;
    }
    case "bow":
      for (let a = 0; a <= 90; a += 3) for (const rr of [12, 11]) {
        const x = Math.round(2 + rr * Math.cos(a * Math.PI / 180)), y = Math.round(2 + rr * Math.sin(a * Math.PI / 180));
        px(x, y, a > 35 && a < 55 ? WOOD[2] : rr === 12 ? WOOD[1] : WOOD[0]);
      }
      for (let x = 3; x <= 13; x++) px(x, 16 - x, "#dcdcdc");
      break;
    case "crossbow":
      for (let x = 1; x <= 12; x++) { px(x, 15 - x, WOOD[1]); px(x + 1, 15 - x, WOOD[2]); }
      for (let k = -5; k <= 5; k++) { const b = Math.floor(Math.abs(k) / 3); px(9 + k - b, 6 + k + b, WOOD[0]); }
      for (let k = -4; k <= 4; k++) if (Math.abs(k) > 1) { const b = Math.abs(k) <= 2 ? 2 : 1; px(9 + k - b - 1, 6 + k + b + 1, "#cfcfcf"); }
      px(9, 6, "#9a9a9a"); px(10, 5, "#9a9a9a"); px(3, 12, "#9a9a9a");
      break;
    case "totem": {
      const G = ["#f2c94c", "#ffe98a", "#c99a2e"];
      for (let y = 1; y <= 6; y++) for (let x = 5; x <= 10; x++) px(x, y, y === 1 ? G[1] : G[0]);
      px(6, 3, "#16b84a"); px(9, 3, "#16b84a"); px(7, 5, G[2]); px(8, 5, G[2]);
      for (let y = 7; y <= 12; y++) for (let x = 4; x <= 11; x++) px(x, y, x === 4 || x === 11 ? G[2] : G[0]);
      for (let y = 8; y <= 11; y++) { px(2, y, G[1]); px(3, y, G[0]); px(12, y, G[0]); px(13, y, G[1]); }
      for (let x = 6; x <= 9; x++) { px(x, 13, G[2]); px(x, 14, G[2]); }
      px(7, 9, "#16b84a"); px(8, 9, "#16b84a");
      break;
    }
    case "torch":
      for (let y = 6; y <= 15; y++) { px(7, y, WOOD[0]); px(8, y, WOOD[1]); }
      px(7, 4, "#ffe36a"); px(8, 4, "#fff3b0"); px(7, 5, "#ffb02a"); px(8, 5, "#ff8a1a"); px(7, 3, "#ffd23a");
      break;
    case "map":
      for (let y = 1; y <= 14; y++) for (let x = 1; x <= 14; x++) {
        const edge = x === 1 || y === 1 || x === 14 || y === 14;
        px(x, y, edge ? "#b9a77f" : r() < 0.45 ? "#e9dfc4" : r() < 0.5 ? "#8fb86a" : "#7fa6d9");
      }
      px(7, 7, "#d23a2a"); px(8, 7, "#d23a2a"); px(7, 8, "#d23a2a");
      break;
  }
  return c;
}

/** Our own shield texture in the game's layout (64x64: plate at 0,0 12x22x1, handle at 26,0 2x6x6). */
function drawShield() {
  const [c, ctx] = canvas(64, 64), r = rng(11);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 28; x++) {
    ctx.fillStyle = (x % 4 === 0) ? "#6b4a2a" : r() < 0.2 ? "#9a7546" : "#8a663b"; ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = "#9da3a8";                                              // iron rim and boss on the front
  ctx.fillRect(1, 1, 12, 1); ctx.fillRect(1, 22, 12, 1); ctx.fillRect(1, 1, 1, 22); ctx.fillRect(12, 1, 1, 22);
  ctx.fillRect(6, 10, 2, 3);
  ctx.fillStyle = "#4a3219"; ctx.fillRect(26, 0, 16, 12);
  return c;
}

/** Turn a sprite into a solid 1-pixel-thick model, like the game shows held items. 16 units wide. */
function extrude(cv, THREE) {
  const N = cv.width, data = cv.getContext("2d").getImageData(0, 0, N, N).data, pu = 16 / N;
  const solid = (i, j) => i >= 0 && j >= 0 && i < N && j < N && data[(j * N + i) * 4 + 3] > 127;
  const pos = [], nor = [], uv = [];
  const quad = (a, b, c2, d, n, u, v) => {
    for (const p of [a, b, c2, a, c2, d]) { pos.push(...p); nor.push(...n); uv.push(u, v); }
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (!solid(i, j)) continue;
    const x0 = i * pu, x1 = x0 + pu, y1 = -j * pu, y0 = y1 - pu, z0 = -0.5, z1 = 0.5, u = (i + 0.5) / N, v = 1 - (j + 0.5) / N;
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], u, v);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], u, v);
    if (!solid(i - 1, j)) quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], u, v);
    if (!solid(i + 1, j)) quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], u, v);
    if (!solid(i, j - 1)) quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], u, v);
    if (!solid(i, j + 1)) quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], u, v);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** Remove the held items. */
function clearItems(viewer) {
  for (const m of viewer.playerObject.userData.items || []) {
    m.parent && m.parent.remove(m);
    m.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map && o.material.map.userData.own) o.material.map.dispose(); o.material.dispose(); } });
  }
  viewer.playerObject.userData.items = [];
}

/** Put items into the hands. hands: { main, off } (see emptyHand). Main hand = right arm. */
export function applyItems(viewer, THREE, hands, pack) {
  clearItems(viewer);
  const skin = viewer.playerObject.skin, list = viewer.playerObject.userData.items;
  const tex = cv => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.userData.own = true; t.userData.equipment = true;
    return t;
  };
  const glintTex = () => {
    const t = new THREE.CanvasTexture((pack && pack.glint_item) || drawGlint());
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.own = true;
    return t;
  };
  const glintMat = t => {
    const g = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    return g;
  };
  for (const [hand, part, side] of [["main", skin.rightArm, -1], ["off", skin.leftArm, 1]]) {
    const h = hands && hands[hand];
    if (!h || !h.item || !(h.item in ITEMS)) continue;
    const pivot = part.children.find(o => o.isGroup) || part;
    const holder = new THREE.Group();
    let meshes = [];
    if (h.item === "shield") {
      const t = tex((pack && pack.shield) || drawShield());
      const mat = new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.1, roughness: 0.7 });
      const plate = new THREE.BoxGeometry(12, 22, 1); boxUVs(plate, 0, 0, 12, 22, 1, 64, 64);
      const grip = new THREE.BoxGeometry(2, 6, 6); boxUVs(grip, 26, 0, 2, 6, 6, 64, 64);
      const a = new THREE.Mesh(plate, mat), b = new THREE.Mesh(grip, mat);
      a.position.set(0, 0, 3.5); b.position.set(0, 0, 0);
      meshes = [a, b];
      // held at the outer side of the arm, front facing forwards, slightly turned out
      holder.scale.setScalar(0.62);
      holder.position.set(side * 2.6, -4.5, 0.5);
      holder.rotation.set(0, side * 0.25, 0);
    } else {
      const key = ITEMS[h.item] ? `item_${h.item}_${h.mat}` : `item_${h.item}`;
      const cv = (pack && pack[key]) || drawItem(h.item, h.mat);
      const geo = extrude(cv, THREE);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex(cv), roughness: 0.6 }));
      const [gx, gy] = GRIP[h.item];
      mesh.position.set(-gx, gy, 0);
      const inner = new THREE.Group();
      inner.add(mesh);
      if (h.item === "map") {
        // a map is held up with its face to the front
        inner.rotation.set(0, 0, 0); holder.position.set(side * -0.5, -5.5, 2.5); holder.rotation.x = -0.5;
      } else {
        // sprite x -> forwards, so the tool points ahead of the figure, tilted a little down
        inner.rotation.y = -Math.PI / 2;
        holder.position.set(0, -5.2, 0.2); holder.rotation.x = 0.35;
      }
      holder.scale.setScalar(0.78);
      holder.add(inner);
      meshes = [mesh];
      if (h.glint) {
        const t = glintTex(), g = new THREE.Mesh(geo, glintMat(t));
        g.position.copy(mesh.position); g.scale.setScalar(1.01);
        g.onBeforeRender = () => { t.offset.set((performance.now() / 6000) % 1, (performance.now() / 9000) % 1); };
        inner.add(g);
      }
    }
    if (h.item === "shield") for (const m of meshes) holder.add(m);
    if (h.glint && h.item === "shield") {
      const t = glintTex();
      for (const m of meshes) {
        const g = new THREE.Mesh(m.geometry.clone(), glintMat(t));
        g.position.copy(m.position); g.scale.setScalar(1.01);
        g.onBeforeRender = () => { t.offset.set((performance.now() / 6000) % 1, (performance.now() / 9000) % 1); };
        holder.add(g);
      }
    }
    holder.traverse(o => { if (o.isMesh) o.castShadow = true; });
    pivot.add(holder); list.push(holder);
  }
}
