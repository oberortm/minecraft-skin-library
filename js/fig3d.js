// A Minecraft player built from CSS 3D boxes. No WebGL, so dozens can be on screen at once.
// Each face shows its rectangle of the skin texture via background-position.
import { faces, legacyTo64, loadImage } from "./skin.js";

const U = 6; // CSS px per texture pixel; the whole figure is scaled by CSS afterwards
const cache = new Map();

/** Legacy 64x32 skins are converted once so every box has its own texture area. */
async function textureUrl(skin) {
  if (skin.fmt !== "64x32") return skin.data;
  const key = skin.id + ":" + skin.updated;
  if (!cache.has(key)) cache.set(key, loadImage(skin.data).then(img => legacyTo64(img).toDataURL("image/png")));
  return cache.get(key);
}

function face(rect, w, h, transform) {
  const [sx, sy] = rect;
  const el = document.createElement("i");
  el.style.cssText = `width:${w * U}px;height:${h * U}px;margin:${-h * U / 2}px 0 0 ${-w * U / 2}px;` +
    `background-position:${-sx * U}px ${-sy * U}px;transform:${transform}`;
  return el;
}

function box(origin, size, center, outer, scale) {
  const [w, h, d] = size;
  const f = faces(origin[0], origin[1], w, h, d);
  const b = document.createElement("div");
  b.className = "f3-box" + (outer ? " f3-outer" : "");
  b.style.transform = `translate3d(${center[0] * U}px, ${center[1] * U}px, ${center[2] * U}px)` + (scale ? ` scale3d(${scale.join(",")})` : "");
  b.append(
    face(f.front, w, h, `translateZ(${d * U / 2}px)`),
    face(f.back, w, h, `rotateY(180deg) translateZ(${d * U / 2}px)`),
    face(f.right, d, h, `rotateY(-90deg) translateZ(${w * U / 2}px)`),
    face(f.left, d, h, `rotateY(90deg) translateZ(${w * U / 2}px)`),
    face(f.top, w, d, `rotateX(90deg) translateZ(${h * U / 2}px)`),
    face(f.bottom, w, d, `rotateX(-90deg) translateZ(${h * U / 2}px) scaleY(-1)`),
  );
  return b;
}

/** Build the figure. Returns the outer element; rotate it via the --ry / --rx custom properties. */
export async function buildFigure(skin) {
  const aw = skin.model === "slim" ? 3 : 4;
  const fig = document.createElement("div");
  fig.className = "f3";
  fig.style.setProperty("--skin", `url("${await textureUrl(skin)}")`);
  fig.style.setProperty("--u", U + "px");
  const parts = [
    // origin base, origin outer, size, center (figure space, y down), outer scale
    [[0, 0], [32, 0], [8, 8, 8], [0, -12, 0], [1.125, 1.125, 1.125]],
    [[16, 16], [16, 32], [8, 12, 4], [0, -2, 0], [8.5 / 8, 12.5 / 12, 4.5 / 4]],
    [[40, 16], [40, 32], [aw, 12, 4], [-(4 + aw / 2), -2, 0], [(aw + .5) / aw, 12.5 / 12, 4.5 / 4]],
    [[32, 48], [48, 48], [aw, 12, 4], [4 + aw / 2, -2, 0], [(aw + .5) / aw, 12.5 / 12, 4.5 / 4]],
    [[0, 16], [0, 32], [4, 12, 4], [-2, 10, 0], [4.5 / 4, 12.5 / 12, 4.5 / 4]],
    [[16, 48], [0, 48], [4, 12, 4], [2, 10, 0], [4.5 / 4, 12.5 / 12, 4.5 / 4]],
  ];
  const rig = document.createElement("div");
  rig.className = "f3-rig";
  for (const [base, outer, size, center, scale] of parts) {
    rig.append(box(base, size, center, false), box(outer, size, center, true, scale));
  }
  fig.append(rig);
  return fig;
}
