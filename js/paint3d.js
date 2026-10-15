// The editor's 3D figure: one skinview3d viewer that you can paint on directly.
// A ray from the pointer hits the skin mesh; the UV at the hit point gives the texture pixel.
// The same viewer doubles as the small rotating preview while the texture view is open.

const TS = 8; // the figure shows the 64x64 texture at 512x512, so the hover frame can be thinner than a pixel
const SKIN = 64;

export class Paint3D {
  constructor({ sv, THREE }) {
    this.THREE = THREE;
    this.viewer = new sv.SkinViewer({ width: 300, height: 300, zoom: 0.9, pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
    this.canvas = this.viewer.canvas;
    this.view = document.createElement("canvas");
    this.view.width = this.view.height = SKIN * TS;
    this.vctx = this.view.getContext("2d");
    this.vctx.imageSmoothingEnabled = false;
    this.texture = new THREE.CanvasTexture(this.view);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    const skin = this.viewer.playerObject.skin;
    skin.map = this.texture;
    skin.visible = true;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.mode = "paint";
    this.rotating = false;
    this.layers = { base: true, outer: true };
    this.resize = new ResizeObserver(entries => {
      for (const e of entries) {
        if (e.target !== this.canvas.parentElement) continue;
        const r = e.contentRect;
        if (r.width && r.height) this.viewer.setSize(Math.round(r.width), Math.round(r.height));
      }
    });
  }

  /** Move the canvas into a container and size it to fit. */
  attach(host) {
    if (this.canvas.parentElement === host) return;
    if (this.canvas.parentElement) this.resize.unobserve(this.canvas.parentElement);
    host.appendChild(this.canvas);
    this.resize.observe(host);
    const r = host.getBoundingClientRect();
    if (r.width && r.height) this.viewer.setSize(Math.round(r.width), Math.round(r.height));
  }

  /** "paint": still figure, left button paints. "preview": small turning figure, left button rotates. */
  setMode(mode) {
    this.mode = mode;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.viewer.autoRotate = mode === "preview" && !reduce;
    this.viewer.autoRotateSpeed = 0.6;
    if (mode === "paint") this.resetView();
    else this.viewer.zoom = 0.8;
    this.syncControls();
  }

  /** Rotate tool or held space: the left button / one finger turns the figure instead of painting. */
  setRotating(on) {
    this.rotating = on;
    this.syncControls();
  }

  syncControls() {
    const { MOUSE, TOUCH } = this.THREE;
    const c = this.viewer.controls;
    const leftRotates = this.mode === "preview" || this.rotating;
    c.mouseButtons = { LEFT: leftRotates ? MOUSE.ROTATE : -1, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
    c.touches = { ONE: leftRotates ? TOUCH.ROTATE : -1, TWO: TOUCH.DOLLY_ROTATE };
    this.canvas.dataset.rotating = String(leftRotates);
  }

  resetView() {
    this.viewer.playerWrapper.rotation.y = 0;
    this.viewer.controls.target.set(0, 0, 0);
    this.viewer.camera.position.set(0.32, 0.12, 1);
    this.viewer.zoom = 0.9;
    this.viewer.controls.update();
  }

  setModel(model) {
    this.viewer.playerObject.skin.modelType = model === "slim" ? "slim" : "default";
  }

  /** Hide whole body parts (both layers); hidden parts are ignored by the ray as well. */
  setParts(parts) {
    const skin = this.viewer.playerObject.skin;
    for (const [id, on] of Object.entries(parts)) if (skin[id]) skin[id].visible = on;
  }

  setLayers(base, outer) {
    this.layers = { base, outer };
    const skin = this.viewer.playerObject.skin;
    skin.setInnerLayerVisible(base);
    skin.setOuterLayerVisible(outer);
  }

  /** Redraw the figure's texture from the 64x64 skin, with an optional frame around one pixel. */
  draw(src, hover) {
    const c = this.vctx;
    c.clearRect(0, 0, SKIN * TS, SKIN * TS);
    c.drawImage(src, 0, 0, SKIN * TS, SKIN * TS);
    if (hover) {
      const x = hover.x * TS, y = hover.y * TS;
      c.fillStyle = hover.blocked ? "#e5484d" : "#0f1012";
      c.fillRect(x, y, TS, 2); c.fillRect(x, y + TS - 2, TS, 2); c.fillRect(x, y, 2, TS); c.fillRect(x + TS - 2, y, 2, TS);
      c.fillStyle = "#ffffff";
      c.fillRect(x + 2, y + 2, TS - 4, 1); c.fillRect(x + 2, y + TS - 3, TS - 4, 1); c.fillRect(x + 2, y + 2, 1, TS - 4); c.fillRect(x + TS - 3, y + 2, 1, TS - 4);
    }
    this.texture.needsUpdate = true;
  }

  /**
   * Texture pixel under a screen point, or null.
   * target "outer": only the outer layer counts. target "base": hidden layers are ignored, a see-through
   * outer pixel lets the ray pass, an opaque one blocks it (returned with blocked: true).
   */
  pick(clientX, clientY, target, alphaAt) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return null;
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.viewer.camera);
    const meshes = [], outerSet = new Set();
    for (const part of this.viewer.playerObject.skin.getBodyParts()) {
      if (!part.visible) continue;
      outerSet.add(part.outerLayer);
      if (target === "outer") meshes.push(part.outerLayer);
      else {
        if (this.layers.base) meshes.push(part.innerLayer);
        if (this.layers.outer) meshes.push(part.outerLayer);
      }
    }
    this.viewer.scene.updateMatrixWorld();
    for (const hit of this.ray.intersectObjects(meshes, false)) {
      const px = texel(hit);
      if (!px) continue;
      const layer = outerSet.has(hit.object) ? "outer" : "base";
      if (layer === target) return { x: px[0], y: px[1], layer };
      // target is base and the ray met the outer shell first
      if (alphaAt(px[0], px[1]) === 0) continue;
      return { x: px[0], y: px[1], layer, blocked: true };
    }
    return null;
  }
}

/** UV at the hit point -> pixel, kept inside the rectangle of the face that was hit. */
function texel(hit) {
  if (!hit.uv || !hit.face) return null;
  const uv = hit.object.geometry.attributes.uv;
  let u0 = 1, u1 = 0, v0 = 1, v1 = 0;
  for (const i of [hit.face.a, hit.face.b, hit.face.c]) {
    const u = uv.getX(i), v = uv.getY(i);
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const x0 = Math.round(u0 * SKIN), x1 = Math.round(u1 * SKIN) - 1;
  const y0 = Math.round((1 - v1) * SKIN), y1 = Math.round((1 - v0) * SKIN) - 1;
  // the texture is flipped vertically on upload (flipY), so v = 1 - y / 64
  const x = Math.min(x1, Math.max(x0, Math.floor(hit.uv.x * SKIN)));
  const y = Math.min(y1, Math.max(y0, Math.floor((1 - hit.uv.y) * SKIN)));
  return x >= 0 && y >= 0 && x < SKIN && y < SKIN ? [x, y] : null;
}
