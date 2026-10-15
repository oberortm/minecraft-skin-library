// Skin geometry and rendering helpers.
// Everything here only reads textures. Nothing changes a skin unless the editor asks for it.

/** Face rectangles of one box part on the texture. */
export function faces(ox, oy, w, h, d) {
  return {
    top: [ox + d, oy, w, d],
    bottom: [ox + d + w, oy, w, d],
    right: [ox, oy + d, d, h],
    front: [ox + d, oy + d, w, h],
    left: [ox + d + w, oy + d, d, h],
    back: [ox + 2 * d + w, oy + d, w, h],
  };
}

/** All body parts of a 64x64 skin, both layers. aw = arm width (4 classic, 3 slim). */
export function parts(aw) {
  return [
    { id: "head", layer: "base", box: [0, 0, 8, 8, 8] },
    { id: "head", layer: "outer", box: [32, 0, 8, 8, 8] },
    { id: "body", layer: "base", box: [16, 16, 8, 12, 4] },
    { id: "body", layer: "outer", box: [16, 32, 8, 12, 4] },
    { id: "rightArm", layer: "base", box: [40, 16, aw, 12, 4] },
    { id: "rightArm", layer: "outer", box: [40, 32, aw, 12, 4] },
    { id: "leftArm", layer: "base", box: [32, 48, aw, 12, 4] },
    { id: "leftArm", layer: "outer", box: [48, 48, aw, 12, 4] },
    { id: "rightLeg", layer: "base", box: [0, 16, 4, 12, 4] },
    { id: "rightLeg", layer: "outer", box: [0, 32, 4, 12, 4] },
    { id: "leftLeg", layer: "base", box: [16, 48, 4, 12, 4] },
    { id: "leftLeg", layer: "outer", box: [0, 48, 4, 12, 4] },
  ].map(p => ({ ...p, faces: faces(...p.box) }));
}

/** Every face rectangle with its part and layer, for hit-testing on the texture. */
export function faceList(aw) {
  const out = [];
  for (const p of parts(aw)) {
    for (const [side, r] of Object.entries(p.faces)) out.push({ part: p.id, layer: p.layer, side, rect: r });
  }
  return out;
}

export function faceAt(aw, x, y) {
  return faceList(aw).find(f => x >= f.rect[0] && x < f.rect[0] + f.rect[2] && y >= f.rect[1] && y < f.rect[1] + f.rect[3]) || null;
}

/** Where each part's face sits in the flat 16x32 figure. */
function figureSlots(aw, side) {
  const front = side === "front";
  return {
    head: [4, 0],
    body: [4, 8],
    rightArm: front ? [4 - aw, 8] : [12, 8],
    leftArm: front ? [12, 8] : [4 - aw, 8],
    rightLeg: front ? [4, 20] : [8, 20],
    leftLeg: front ? [8, 20] : [4, 20],
  };
}

/**
 * Pieces that make up the flat figure: [sx, sy, w, h, dx, dy, mirror, layer].
 * Legacy 64x32 skins have no left limbs and no limb/body overlay; the left limbs mirror the right ones.
 */
export function figurePieces(model, side, legacy = false) {
  const aw = model === "slim" ? 3 : 4;
  const slots = figureSlots(aw, side);
  const pieces = [];
  for (const p of parts(aw)) {
    let src = p;
    let mirror = false;
    if (legacy) {
      if (p.layer === "outer" && p.id !== "head") continue;
      if (p.id === "leftArm" || p.id === "leftLeg") {
        src = parts(aw).find(q => q.id === (p.id === "leftArm" ? "rightArm" : "rightLeg") && q.layer === "base");
        mirror = true;
      }
    }
    const r = src.faces[side];
    const [dx, dy] = slots[p.id];
    pieces.push([r[0], r[1], r[2], r[3], dx, dy, mirror, p.layer]);
  }
  // draw base first, then outer
  return pieces.sort((a, b) => (a[7] === b[7] ? 0 : a[7] === "base" ? -1 : 1));
}

/** Render front or back of a skin into a 16x32 canvas. */
export function renderFigure(canvas, img, model, side, { legacy = false, outer = true, dimLayer = null } = {}) {
  canvas.width = 16; canvas.height = 32;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 32);
  for (const [sx, sy, w, h, dx, dy, mirror, layer] of figurePieces(model, side, legacy)) {
    if (layer === "outer" && !outer) continue;
    ctx.globalAlpha = dimLayer && layer === dimLayer ? 0.35 : 1;
    if (!mirror) ctx.drawImage(img, sx, sy, w, h, dx, dy, w, h);
    else { ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
}

/** Map a pixel on the flat figure back to a texture pixel for the chosen layer. */
export function figureToTexture(model, side, layer, vx, vy) {
  for (const [sx, sy, w, h, dx, dy, mirror, l] of figurePieces(model, side, false)) {
    if (l !== layer) continue;
    if (vx >= dx && vx < dx + w && vy >= dy && vy < dy + h) {
      const fx = vx - dx;
      return [sx + (mirror ? w - 1 - fx : fx), sy + (vy - dy)];
    }
  }
  return null;
}

/** Guess arm model from the texture: slim skins leave the last column of the right arm's back face empty. */
export function detectModel(img) {
  if (img.height === 32) return "classic";
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(54, 20, 2, 12).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return "classic";
  return "slim";
}

/** Convert a legacy 64x32 skin to 64x64 the way the game does: left limbs become mirrored copies. */
export function legacyTo64(img) {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const copy = (src, dst) => {
    const s = faces(...src), t = faces(...dst);
    const map = { top: "top", bottom: "bottom", front: "front", back: "back", right: "left", left: "right" };
    for (const [tk, sk] of Object.entries(map)) {
      const [sx, sy, w, h] = s[sk];
      const [tx, ty] = t[tk];
      ctx.save(); ctx.translate(tx + w, ty); ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      ctx.restore();
    }
  };
  copy([0, 16, 4, 12, 4], [16, 48, 4, 12, 4]);   // leg
  copy([40, 16, 4, 12, 4], [32, 48, 4, 12, 4]);  // arm
  return c;
}

/** Labelled regions on the texture, for the overlay. */
export const REGIONS = [
  [0, 0, 32, 16, "head"], [32, 0, 32, 16, "hat"],
  [0, 16, 16, 16, "rightLeg"], [16, 16, 24, 16, "body"], [40, 16, 16, 16, "rightArm"],
  [0, 32, 16, 16, "rightPants"], [16, 32, 24, 16, "jacket"], [40, 32, 16, 16, "rightSleeve"],
  [0, 48, 16, 16, "leftPants"], [16, 48, 16, 16, "leftLeg"], [32, 48, 16, 16, "leftArm"], [48, 48, 16, 16, "leftSleeve"],
];

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("image"));
    i.src = src;
  });
}

/** A plain grey mannequin to start drawing on. Original, not based on any existing skin. */
export function blankTemplate(model) {
  const aw = model === "slim" ? 3 : 4;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d");
  const tone = { head: "#c9ced8", body: "#9aa3b3", rightArm: "#b4bbc8", leftArm: "#b4bbc8", rightLeg: "#7d8697", leftLeg: "#7d8697" };
  for (const p of parts(aw)) {
    if (p.layer !== "base") continue;
    for (const [side, [x, y, w, h]] of Object.entries(p.faces)) {
      ctx.fillStyle = tone[p.id];
      ctx.fillRect(x, y, w, h);
      if (side === "front" || side === "back") continue;
      ctx.fillStyle = "rgba(0,0,0,.08)";
      ctx.fillRect(x, y, w, h);
    }
  }
  return c;
}
