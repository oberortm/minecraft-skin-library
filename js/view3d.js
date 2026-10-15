// Loads the 3D engine only when it is needed: skinview3d (ES modules) on top of one shared three.js.
// The import map in index.html points "skinview3d" and "three" at vendor/, so skinview3d and our
// own code (raycasting in the editor, the block world in the presentation) use the same three.js.
// If loading fails (very old browser, blocked file), only the 3D parts fall back; the rest keeps working.
let pending = null;

/** Render at most 2 device pixels per CSS pixel: phones with 3x screens look the same but draw far fewer pixels. */
export const pixelRatio = () => Math.min(2, window.devicePixelRatio || 1);

export function load3d() {
  if (!pending) {
    pending = Promise.all([import("skinview3d"), import("three")])
      .then(([sv, THREE]) => ({ sv, THREE }))
      .catch(e => { console.error("[skin-library] 3D engine could not be loaded:", e); return null; });
  }
  return pending;
}
