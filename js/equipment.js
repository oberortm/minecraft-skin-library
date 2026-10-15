// Equipment for the presentation figure: elytra, armour and items in the hands.
// Textures are drawn here by default; when the user picked Minecraft's own textures or a pack
// (js/pack.js), those are used instead. The choice is remembered for all skins.

import { drawElytra, drawArmor, drawTrim, drawGlint, drawItem, drawShield } from "./equipart.js";
export { drawElytra, drawGlint };

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
  glintTex.wrapS = glintTex.wrapT = THREE.RepeatWrapping; glintTex.repeat.set(2, 2); glintTex.userData.own = true;
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
      const g = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ map: glintTex, alphaMap: mask, alphaTest: 0.1, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
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
