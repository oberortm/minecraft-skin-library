// Equipment for the presentation figure: elytra, armour and items in the hands.
// Textures are drawn here by default; when the user picked Minecraft's own textures or a pack
// (js/pack.js), those are used instead. The choice is remembered for all skins.

const KEY = "skin-library-equipment";

export function defaultEquipment() {
  return { elytra: false };
}
export function loadEquipment() {
  const e = defaultEquipment();
  try { Object.assign(e, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (err) { /* ignore */ }
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
