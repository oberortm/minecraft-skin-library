// Our own pixel art for the equipment: armour (64x32 in the game's layout), trims, the enchantment
// shimmer, held items (16x16), the shield and the elytra. Everything is drawn here in code; nothing is
// taken from the game. It is used when Minecraft's own textures are not available.

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
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const mul = (c, f) => c.map(v => Math.max(0, Math.min(255, v * f)));
/** Five tones from dark to bright around one colour (for dyed leather and trim materials). */
const tonesOf = h => { const c = hex(h); return [mul(c, 0.38), mul(c, 0.66), c, mul(c, 1.2), mul(c, 1.42)]; };

/** Tones per material: outline, shadow, base, light, highlight. */
const ARMOR_TONES = {
  leather: ["#3e2617", "#6e4127", "#a06540", "#c08155", "#d89a6a"],
  chainmail: ["#2b2e33", "#555a61", "#868c94", "#b4b9bf", "#dde0e4"],
  iron: ["#4f4f52", "#8c8c90", "#c3c3c6", "#dfdfe1", "#ffffff"],
  gold: ["#6e4f0a", "#b88d1a", "#e9c23a", "#f8df63", "#fff8b8"],
  copper: ["#5e2b1c", "#9b4f35", "#c9714d", "#e4936f", "#ffbf9c"],
  diamond: ["#0f4f4b", "#239389", "#43cfc4", "#8ff0e7", "#dafffb"],
  netherite: ["#171315", "#2b2527", "#433c3e", "#5c5355", "#7d7375"],
};
const toneRGB = mat => ARMOR_TONES[mat].map(hex);

// ---------- armour ----------
/** The faces of a box in the old 64x32 skin layout, with their size. */
function boxFaces(u, v, w, h, d) {
  return [
    ["top", u + d, v, w, d], ["bottom", u + d + w, v, w, d],
    ["right", u, v + d, d, h], ["front", u + d, v + d, w, h], ["left", u + d + w, v + d, d, h], ["back", u + 2 * d + w, v + d, w, h],
  ];
}
const PARTS = {
  head: [["head", 0, 0, 8, 8, 8]],
  chest: [["body", 16, 16, 8, 12, 4], ["arm", 40, 16, 4, 12, 4]],
  legs: [["body", 16, 16, 8, 12, 4], ["leg", 0, 16, 4, 12, 4]],
  feet: [["leg", 0, 16, 4, 12, 4]],
};

/**
 * Shape and shading of each piece: returns the tone (0 outline .. 4 highlight) of a covered pixel,
 * or -1 where the armour leaves the skin free. fx/fy count from the face's top left.
 */
function armorTone(slot, part, face, fx, fy, fw, fh) {
  const side = face === "left" || face === "right";
  if (slot === "head") {
    if (face === "bottom") return -1;
    if (face === "top") return fx === 0 || fy === 0 || fx === fw - 1 || fy === fh - 1 ? 2 : (fx === 3 || fx === 4) ? 4 : 3;
    if (face === "front") {
      const cheek = fx === 0 || fx === fw - 1, last = cheek ? 5 : 1;
      if (fy > last) return -1;
      if (fy === 0) return 4;
      if (fy === last) return 1;
      return cheek ? 2 : (fx === 2 || fx === 5) ? 4 : 3;      // rivets on the brow band
    }
    const last = face === "back" ? 6 : 5;
    if (fy > last) return -1;
    if (fy === 0) return 3;
    if (fy === last) return 1;
    return side && fx === Math.floor(fw / 2) ? 1 : 2;          // seam along the side
  }
  if (slot === "chest" && part === "body") {
    if (face === "bottom") return -1;
    if (face === "top") return fx === 0 || fx === fw - 1 ? 2 : 3;
    if (fy > 10) return -1;
    if (fy === 10) return 1;
    if (fy === 0) return 4;
    if (face === "front") {
      if (fy === 9) return (fx === 3 || fx === 4) ? 4 : 1;      // belt with a buckle
      if (fx === 0 || fx === fw - 1) return 1;
      if ((fx === 3 || fx === 4) && fy < 8) return fx === 3 ? 4 : 3;   // breastbone ridge
      if (fy === 2 && fx !== 3 && fx !== 4) return 3;
      return fy > 6 ? 2 : 2;
    }
    if (face === "back") return (fx === 3 || fx === 4) && fy < 9 ? 1 : fy === 9 ? 1 : 2;
    return fy === 9 ? 1 : 2;
  }
  if (slot === "chest" && part === "arm") {
    if (face === "bottom") return -1;
    if (face === "top") return 3;
    if (fy > 4) return -1;
    if (fy === 0) return 4;
    if (fy === 4) return 0;
    if (fy === 3) return 1;
    return face === "front" && fx === 1 && fy === 2 ? 4 : 2;
  }
  if (slot === "legs" && part === "body") {
    if (face === "top" || face === "bottom") return -1;
    if (fy < 7) return -1;
    if (fy === 7) return face === "front" && (fx === 3 || fx === 4) ? 4 : 1;   // waistband and buckle
    return fy === 11 ? 1 : 2;
  }
  if (slot === "legs" && part === "leg") {
    if (face === "top" || face === "bottom") return -1;
    if (fy > 8) return -1;
    if (fy === 8) return 1;
    if (face === "front" && (fy === 4 || fy === 5)) return fy === 4 ? 4 : 3;     // knee plate
    if (side && fx === 0) return 1;
    return fy === 0 ? 3 : 2;
  }
  if (slot === "feet") {
    if (face === "top") return -1;
    if (face === "bottom") return 0;                                            // sole
    if (fy < 7) return -1;
    if (fy === 7) return 4;                                                     // cuff
    if (fy === 8) return 1;
    if (fy === 11) return 0;
    return face === "front" && fy === 9 ? 3 : 2;
  }
  return -1;
}

/** Our own armour texture for one slot and material (64x32, dyed for leather). */
export function drawArmor(slot, mat, dye) {
  const [c, ctx] = canvas(64, 32), r = rng(17 + slot.length * 31 + mat.length * 7);
  const T = mat === "leather" && dye ? tonesOf(dye) : toneRGB(mat);
  const img = ctx.createImageData(64, 32), D = img.data;
  const put = (x, y, col, a = 255) => { const i = (y * 64 + x) * 4; D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = a; };
  for (const [part, u, v, w, h, d] of PARTS[slot]) {
    for (const [face, x0, y0, fw, fh] of boxFaces(u, v, w, h, d)) {
      for (let fy = 0; fy < fh; fy++) for (let fx = 0; fx < fw; fx++) {
        let t = armorTone(slot, part, face, fx, fy, fw, fh);
        if (t < 0) continue;
        const x = x0 + fx, y = y0 + fy;
        if (mat === "chainmail" && t >= 1 && t <= 3) {
          // rings: a hole in every other pixel of every other row, links in between
          if (fy % 2 === 1 && fx % 2 === (fy % 4 === 1 ? 0 : 1)) continue;
          t = (fx + fy) % 2 ? 3 : 1;
        }
        let col = T[t], f = 0.96 + r() * 0.08;
        if (mat === "diamond" && t >= 2 && (fx + fy * 3) % 7 === 0) col = T[4];         // facets
        if (mat === "netherite" && t >= 2 && r() < 0.08) col = mul(T[3], 1.05);          // ancient debris specks
        if (mat === "copper" && t >= 2 && r() < 0.05) col = hex("#5fa58c");               // a little patina
        if (mat === "leather" && t === 2 && fy % 3 === 1 && fx % 2 === 0 && (fx === 0 || fx === fw - 1)) col = T[1];   // stitches
        if (mat === "gold" || mat === "iron") f = 0.98 + r() * 0.04;                       // polished metal
        put(x, y, mul(col, f));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Trim ornaments: true where the pattern lies (fx/fy on one face). Our own simple designs, one per pattern. */
const TRIM_SHAPES = {
  sentry: (fx, fy, fw) => fy === 2 || (fy === 5 && fx % 3 === 1),
  dune: (fx, fy) => fy === 3 + ((fx >> 1) % 2) || fy === 7 + ((fx >> 1) % 2),
  coast: (fx, fy) => fy === 2 + Math.round(Math.sin(fx * 0.9)) || fy === 6 + Math.round(Math.sin(fx * 0.9 + 2)),
  wild: (fx, fy, fw) => fx === Math.round(fw / 2 - 1 + Math.sin(fy * 1.1) * 1.4) || (fy % 4 === 2 && Math.abs(fx - fw / 2) < 2.5),
  ward: (fx, fy, fw, fh) => (fx === 1 || fx === fw - 2) && fy >= 1 && fy <= fh - 3 || (fy === 1 || fy === fh - 3) && fx >= 1 && fx <= fw - 2,
  eye: (fx, fy, fw) => { const cx = (fw - 1) / 2, e = (fx - cx) ** 2 / 6 + (fy - 4) ** 2 / 1.2; return (e > 0.6 && e < 1.6) || (Math.abs(fx - cx) < 1 && fy === 4); },
  vex: (fx, fy, fw) => { const cx = (fw - 1) / 2; return fy === 2 + Math.round(Math.abs(fx - cx)) || fy === 6 + Math.round(Math.abs(fx - cx)); },
  tide: (fx, fy) => fy === 5 + ((fx % 4) === 3 ? -1 : (fx % 4) === 1 ? 1 : 0) || (fy === 8 && fx % 2 === 0),
  snout: (fx, fy, fw) => { const cx = (fw - 1) / 2; return fy >= 3 && fy <= 6 && Math.abs(fx - cx) <= 2 && !(fy === 5 && Math.abs(fx - cx) > 0.5 && Math.abs(fx - cx) < 1.6); },
  rib: (fx, fy, fw) => fy % 2 === 1 && fy < 9 && (fx < fw / 2 - 0.5 || fx > fw / 2 - 0.5) && fx !== Math.floor(fw / 2) && fx !== Math.ceil(fw / 2) - 1,
  spire: (fx, fy, fw) => { const cx = (fw - 1) / 2; return Math.abs(fx - cx) <= Math.max(0, (fy - 1) / 3) && fy >= 1 && fy <= 8; },
  wayfinder: (fx, fy, fw) => { const cx = (fw - 1) / 2; return Math.round(Math.abs(fx - cx) + Math.abs(fy - 4.5)) === 3; },
  shaper: (fx, fy, fw, fh) => (fy === 1 && (fx < 3 || fx > fw - 4)) || ((fx === 0 || fx === fw - 1) && fy < 4) || (fy === fh - 3 && fx % 3 === 0),
  silence: (fx, fy, fw) => (fx + fy) % 4 === 0 && fy < 9 || fy === 0 || (fx === Math.floor(fw / 2) && fy < 9),
  raiser: (fx, fy, fw) => { const cx = (fw - 1) / 2; return Math.round(fy - 2 - Math.abs(fx - cx)) % 4 === 0 && fy >= 2; },
  host: (fx, fy, fw) => (fx === 1 || fx === fw - 2) && fy % 3 !== 2 || fy === 0,
  flow: (fx, fy, fw) => { const cx = (fw - 1) / 2, a = Math.atan2(fy - 4.5, fx - cx), rr = Math.hypot(fx - cx, fy - 4.5); return Math.abs(rr - (a + Math.PI) * 0.55) < 0.5; },
  bolt: (fx, fy, fw) => fx === Math.round(fw / 2 - 1 + ((fy % 4) < 2 ? fy % 4 : 4 - fy % 4) - 1),
};

/** Our own trim drawing in the armour layout, shaded in the trim material's tones. */
export function drawTrim(slot, pattern, color) {
  const [c, ctx] = canvas(64, 32), T = tonesOf(color), shape = TRIM_SHAPES[pattern] || TRIM_SHAPES.sentry;
  for (const [part, u, v, w, h, d] of PARTS[slot]) {
    for (const [face, x0, y0, fw, fh] of boxFaces(u, v, w, h, d)) {
      if (face === "top" || face === "bottom") continue;
      // legs and boots use the lower part of their face, so the pattern sits on the armour
      const shift = slot === "feet" ? 7 : (slot === "legs" && part === "body") ? 7 : 0;
      const on = (fx, fy) => fx >= 0 && fx < fw && fy >= 0 && fy < fh && armorTone(slot, part, face, fx, fy, fw, fh) > 0 && shape(fx, fy - shift, fw, fh - shift);
      for (let fy = 0; fy < fh; fy++) for (let fx = 0; fx < fw; fx++) {
        if (!on(fx, fy)) continue;
        // lit from above: brighter where the ornament starts, darker where it ends
        const t = !on(fx, fy - 1) ? 4 : !on(fx, fy + 1) ? 1 : 2;
        ctx.fillStyle = css(T[t]); ctx.fillRect(x0 + fx, y0 + fy, 1, 1);
      }
    }
  }
  return c;
}

/** The enchantment shimmer: thin purple streaks at two angles, tileable. */
export function drawGlint() {
  const [c, ctx] = canvas(64, 64);
  const img = ctx.createImageData(64, 64), D = img.data;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = ((x + y * 2) % 32) / 32, b = ((x * 3 - y + 640) % 64) / 64;
    const s1 = Math.max(0, 1 - Math.abs(a - 0.5) * 9), s2 = Math.max(0, 1 - Math.abs(b - 0.5) * 14);
    const v = Math.min(1, s1 * 0.85 + s2 * 0.55);
    const i = (y * 64 + x) * 4;
    D[i] = 120 * v; D[i + 1] = 60 * v; D[i + 2] = 230 * v; D[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------- held items (16x16) ----------
const TOOL_TONES = {
  wood: ["#3b2812", "#634420", "#8a6332", "#a87c45", "#c29a5e"],
  stone: ["#2f2f31", "#5b5b5e", "#7d7d80", "#9a9a9d", "#b8b8bb"],
  copper: ARMOR_TONES.copper, iron: ARMOR_TONES.iron, gold: ARMOR_TONES.gold, diamond: ARMOR_TONES.diamond,
  netherite: ARMOR_TONES.netherite,
};
const HANDLE = ["#2c1d0c", "#4f3518", "#6f4c25", "#8d6633", "#a67d45"];
const TRIDENT = ["#123630", "#22594e", "#3a8a7a", "#64bca8", "#a6e7d6"];
const MACE = ["#1d1d22", "#3a3a41", "#57575f", "#7c7c86", "#a9a9b4"];
const TOTEM = ["#5b3d06", "#a9781a", "#e6b632", "#f7d65a", "#fff3a8"];
const PAPER = ["#4f4430", "#9d8a62", "#d9c99e", "#ebe0bd", "#fbf5df"];

/**
 * A small sprite painter: cells hold [palette, tone]; at the end every empty pixel next to a cell
 * gets that palette's outline tone (the dark rim of the game's item art), unless the cell says not to.
 */
function sprite(draw, flipY = false) {
  const cells = new Map();
  // flipY: drawn upside down, so the picture matches the game's sprite (the bow's limbs run the other way)
  const set = (x, y, pal, t, rim = true) => { if (flipY) y = 15 - y; if (x >= 0 && y >= 0 && x < 16 && y < 16) cells.set(x + y * 16, [pal, t, rim]); };
  draw(set);
  const [c, ctx] = canvas(16, 16);
  const rim = new Map();
  for (const [k, [pal, , r]] of cells) {
    if (!r) continue;
    const x = k % 16, y = Math.floor(k / 16);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = nx + ny * 16;
      if (nx < 0 || ny < 0 || nx > 15 || ny > 15 || cells.has(nk)) continue;
      rim.set(nk, pal);
    }
  }
  for (const [k, pal] of rim) { ctx.fillStyle = pal[0]; ctx.fillRect(k % 16, Math.floor(k / 16), 1, 1); }
  for (const [k, [pal, t]] of cells) { ctx.fillStyle = pal[t]; ctx.fillRect(k % 16, Math.floor(k / 16), 1, 1); }
  return c;
}
/** Diagonal from bottom left to top right: cells with x + y = 15 + off, for x in [x0, x1]. */
const diag = (set, x0, x1, off, pal, tone) => { for (let x = x0; x <= x1; x++) set(x, 15 + off - x, pal, typeof tone === "function" ? tone(x) : tone); };

export function drawItem(item, mat) {
  const M = TOOL_TONES[mat] || TOOL_TONES.iron;
  switch (item) {
    case "sword": return sprite(set => {
      diag(set, 5, 14, -1, M, 4); diag(set, 5, 14, 0, M, 3); diag(set, 6, 14, 1, M, 2);
      set(14, 0, M, 4); set(15, 0, M, 3);
      for (let k = -2; k <= 2; k++) set(4 + k, 10 + k, k === 0 ? M : M, k === 0 ? 3 : 1);      // guard
      diag(set, 1, 3, 0, HANDLE, x => (x % 2 ? 3 : 2)); diag(set, 2, 3, 1, HANDLE, 1);
      set(0, 15, M, 2); set(1, 15, M, 1);                                                    // pommel
    });
    case "pickaxe": return sprite(set => {
      diag(set, 1, 9, 0, HANDLE, x => (x % 2 ? 3 : 2)); diag(set, 2, 9, 1, HANDLE, 1);
      // head: a quarter ring around the bottom of the handle, thicker in the middle
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 2.5, y - 12.5), a = Math.atan2(12.5 - y, x - 2.5);
        if (a < 0.08 || a > Math.PI / 2 - 0.08) continue;
        const mid = 1 - Math.abs(a - Math.PI / 4) / (Math.PI / 4);
        const half = 0.6 + mid * 0.9;
        if (Math.abs(d - 11.4) <= half) set(x, y, M, d > 11.4 + half * 0.3 ? 4 : d < 11.4 - half * 0.4 ? 1 : 3);
      }
    });
    case "axe": return sprite(set => {
      diag(set, 1, 11, 0, HANDLE, x => (x % 2 ? 3 : 2)); diag(set, 2, 11, 1, HANDLE, 1);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const s = (x - y) / 2, t = 15 - (x + y);       // s: along the handle, t: towards the blade
        if (t < 1 || t > 7) continue;
        const lo = 1.6 - t * 0.35, hi = 4.4 + t * 0.25;
        if (s < lo || s > hi) continue;
        set(x, y, M, t >= 6.5 ? 4 : t >= 5 ? 3 : t <= 1.5 ? 1 : 2);
      }
    });
    case "spear": return sprite(set => {
      diag(set, 0, 10, 0, HANDLE, x => (x % 3 === 0 ? 1 : 3));
      set(9, 5, M, 1); set(10, 5, M, 1); set(9, 6, M, 1);                                    // collar
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const s = (x - y) / 2 - 3.5, t = (x + y) - 15;   // s from the collar towards the tip
        if (s < 1 || s > 8) continue;
        const w = 1.7 * Math.sin(Math.PI * (s - 0.6) / 7.6);
        if (Math.abs(t) > w) continue;
        set(x, y, M, t < -0.4 ? 4 : t > 0.4 ? 2 : 3);
      }
    });
    case "mace": return sprite(set => {
      diag(set, 1, 6, 0, HANDLE, x => (x % 2 ? 3 : 2)); diag(set, 2, 6, 1, HANDLE, 1);
      set(0, 15, MACE, 2);
      for (let y = 2; y <= 8; y++) for (let x = 7; x <= 13; x++) {
        const edge = x === 7 || x === 13 || y === 2 || y === 8;
        if ((x === 7 || x === 13) && (y === 2 || y === 8)) continue;
        set(x, y, MACE, edge ? 1 : (x + y) % 3 === 0 ? 3 : 2);
      }
      for (const [x, y] of [[10, 1], [14, 5], [10, 9], [6, 5], [8, 1], [12, 1], [14, 3], [14, 7]]) set(x, y, MACE, 4);
      set(9, 4, TOTEM, 3); set(10, 5, TOTEM, 2); set(11, 6, TOTEM, 3); set(10, 4, TOTEM, 4);    // brass core
    });
    case "trident": return sprite(set => {
      diag(set, 0, 10, 0, TRIDENT, x => (x % 4 === 0 ? 1 : 3)); diag(set, 1, 10, 1, TRIDENT, 1);
      diag(set, 11, 15, 0, TRIDENT, 4);
      for (const [x, y] of [[9, 3], [10, 4], [12, 6], [13, 7]]) set(x, y, TRIDENT, 2);         // crossbar
      for (const [x, y, t] of [[10, 2, 3], [11, 1, 4], [12, 0, 4], [14, 6, 3], [15, 5, 4], [11, 4, 2]]) set(x, y, TRIDENT, t);
    });
    case "bow": return sprite(set => {
      for (let a = 0; a <= 90; a += 2) {
        const rad = a * Math.PI / 180, x = Math.round(2 + 12 * Math.cos(rad)), y = Math.round(2 + 12 * Math.sin(rad));
        const grip = a > 36 && a < 54;
        set(x, y, HANDLE, grip ? 1 : a < 12 || a > 78 ? 4 : 3);
        const x2 = Math.round(2 + 11 * Math.cos(rad)), y2 = Math.round(2 + 11 * Math.sin(rad));
        if (!grip) set(x2, y2, HANDLE, 2);
      }
      for (let x = 4; x <= 12; x++) set(x, 16 - x, PAPER, 4, false);                        // string
    }, true);
    case "crossbow": return sprite(set => {
      diag(set, 1, 11, 0, HANDLE, 2); diag(set, 2, 11, 1, HANDLE, 1); diag(set, 9, 13, -1, HANDLE, 3);
      for (let k = -5; k <= 5; k++) { const b = Math.floor(Math.abs(k) / 2.5); set(9 + k - b, 6 + k + b, HANDLE, Math.abs(k) > 3 ? 4 : 3); }
      for (let k = -4; k <= 4; k++) { const b = 2 + Math.floor(Math.abs(k) / 2.5); set(9 + k - b, 6 + k + b, PAPER, 4, false); }
      set(9, 6, TOOL_TONES.iron, 2); set(10, 5, TOOL_TONES.iron, 3); set(4, 11, TOOL_TONES.iron, 2);
    });
    case "totem": return sprite(set => {
      for (let y = 1; y <= 6; y++) for (let x = 5; x <= 10; x++) set(x, y, TOTEM, y === 1 ? 4 : x === 5 ? 3 : x === 10 ? 1 : 2);
      set(6, 3, ["#063", "#0a6b2c", "#16b84a", "#3fe070", "#9cffb9"], 3); set(9, 3, ["#063", "#0a6b2c", "#16b84a", "#3fe070", "#9cffb9"], 3);
      set(7, 5, TOTEM, 1); set(8, 5, TOTEM, 1);
      for (let y = 7; y <= 12; y++) for (let x = 4; x <= 11; x++) set(x, y, TOTEM, x === 4 ? 3 : x === 11 ? 1 : y === 7 ? 3 : 2);
      for (let y = 8; y <= 11; y++) { set(2, y, TOTEM, 3); set(3, y, TOTEM, 2); set(12, y, TOTEM, 2); set(13, y, TOTEM, 1); }
      for (let x = 6; x <= 9; x++) { set(x, 13, TOTEM, 1); set(x, 14, TOTEM, x < 8 ? 2 : 1); }
      set(7, 9, ["#063", "#0a6b2c", "#16b84a", "#3fe070", "#9cffb9"], 2); set(8, 9, ["#063", "#0a6b2c", "#16b84a", "#3fe070", "#9cffb9"], 4);
    });
    case "torch": return sprite(set => {
      for (let y = 6; y <= 15; y++) { set(7, y, HANDLE, 3, false); set(8, y, HANDLE, 1, false); }
      const F = ["#7a2a00", "#e0601a", "#ff9a1f", "#ffd84a", "#fff6c8"];
      set(7, 5, F, 2, false); set(8, 5, F, 1, false); set(7, 4, F, 3, false); set(8, 4, F, 4, false); set(7, 3, F, 3, false);
    });
    case "map": return sprite(set => {
      const G = ["#2b4a1c", "#4f7a32", "#76a64b", "#93c062", "#b5da86"], W = ["#1b3866", "#3365a8", "#5b8ed6", "#82adeb", "#b4d0f7"];
      for (let y = 1; y <= 14; y++) for (let x = 1; x <= 14; x++) {
        const edge = x === 1 || y === 1 || x === 14 || y === 14;
        if (edge) { set(x, y, PAPER, x === 1 || y === 1 ? 3 : 1); continue; }
        const land = Math.sin(x * 0.7) + Math.cos(y * 0.6) + Math.sin((x + y) * 0.35) > 0.4;
        set(x, y, land ? G : W, land ? ((x * y) % 5 === 0 ? 1 : 2) : ((x + y) % 4 === 0 ? 3 : 2));
      }
      set(7, 7, ["#400", "#902018", "#d23a2a", "#f06050", "#ff9a90"], 3); set(8, 8, ["#400", "#902018", "#d23a2a", "#f06050", "#ff9a90"], 2);
    });
  }
  return canvas(16, 16)[0];
}

/** Our own shield in the game's layout (64x64: plate at 0,0 12x22x1, handle at 26,0 2x6x6). */
export function drawShield() {
  const [c, ctx] = canvas(64, 64), r = rng(11);
  const PLANK = ["#3b2a17", "#5e4426", "#7d5c35", "#98744a", "#b18c5c"].map(hex), RIM = ARMOR_TONES.iron.map(hex);
  const px = (x, y, col) => { ctx.fillStyle = css(col); ctx.fillRect(x, y, 1, 1); };
  // front (1,1)-(13,23) and back (14,1)-(26,23): vertical planks with grain and knots
  for (const ox of [1, 14]) {
    for (let y = 0; y < 22; y++) for (let x = 0; x < 12; x++) {
      const plank = Math.floor(x / 3), seam = x % 3 === 2;
      let t = seam ? 1 : 2 + ((y + plank * 5) % 7 === 0 ? 1 : 0) - ((y * 3 + plank) % 11 === 0 ? 1 : 0);
      px(ox + x, 1 + y, mul(PLANK[t], 0.95 + r() * 0.1));
    }
  }
  // iron rim and boss on the front
  for (let y = 0; y < 22; y++) for (let x = 0; x < 12; x++) {
    const edge = x === 0 || x === 11 || y === 0 || y === 21;
    if (edge) px(1 + x, 1 + y, RIM[(x === 0 || y === 0) ? 3 : 1]);
  }
  for (const [x, y] of [[2, 2], [9, 2], [2, 19], [9, 19]]) px(1 + x, 1 + y, RIM[4]);
  for (let y = 8; y <= 12; y++) for (let x = 4; x <= 7; x++) px(1 + x, 1 + y, RIM[(x === 4 || y === 8) ? 4 : (x === 7 || y === 12) ? 1 : 2]);
  // edges of the plate and the handle
  for (let y = 0; y < 24; y++) { px(0, y, PLANK[1]); px(13, y, PLANK[1]); }
  for (let x = 0; x < 28; x++) { px(x, 0, PLANK[3]); }
  for (let y = 0; y < 12; y++) for (let x = 26; x < 42; x++) px(x, y, PLANK[(x + y) % 4 === 0 ? 0 : 1]);
  return c;
}

/**
 * Our own elytra (64x32, the game's layout: one wing as a 10x20x2 box at 22,0). Grey-violet membrane,
 * overlapping rows of feathers with light tips and a darker leading edge.
 */
export function drawElytra() {
  const [c, ctx] = canvas(64, 32), r = rng(7);
  const T = ["#3b3548", "#5f5872", "#857d99", "#a39cb6", "#c4bed4"].map(hex);
  const px = (x, y, col) => { ctx.fillStyle = css(col); ctx.fillRect(x, y, 1, 1); };
  // big faces: front (24,2)-(34,22) and back (36,2)-(46,22)
  for (const ox of [24, 36]) {
    for (let y = 0; y < 20; y++) for (let x = 0; x < 10; x++) {
      const fx = ox === 24 ? x : 9 - x;                 // mirror so the leading edge is on the same side
      const row = Math.floor((y + (fx >> 1)) / 4), inRow = (y + (fx >> 1)) % 4;
      let t = inRow === 3 ? 1 : inRow === 0 ? 3 : 2;    // feather tip light, its shadow dark
      if (fx === 0) t = 1;                               // leading edge
      if (y > 15 && fx > 2 + (19 - y) * 2) continue;     // ragged, tapering tip
      if (row % 2 && inRow === 1 && fx % 3 === 1) t = 3;
      px(ox + x, 2 + y, mul(T[t], 0.95 + r() * 0.1));
    }
  }
  // thin sides and top
  for (let y = 2; y < 22; y++) { px(22, y, T[1]); px(23, y, T[1]); px(34, y, T[2]); px(35, y, T[2]); }
  for (let x = 24; x < 44; x++) { px(x, 0, T[3]); px(x, 1, T[2]); }
  return c;
}
