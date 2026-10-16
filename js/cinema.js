// Cinematics for the presentation: a "build" film (the skin assembles itself, pixel by pixel and part
// by part) and a fast-cut trailer through the block worlds. Both can be recorded as a video file:
// every rendered frame is copied, together with letterbox bars and titles, into a canvas whose stream
// a MediaRecorder writes.
import { t } from "./i18n.js";
import { faceAt } from "./skin.js";

const PARTS = ["rightLeg", "leftLeg", "body", "rightArm", "leftArm", "head"];
const ease = x => 1 - (1 - x) ** 3;
const easeInOut = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const lerp = (a, b, k) => a + (b - a) * k;

/** Can this browser record a canvas into a video file? Returns the type to use, or null. */
export function videoType() {
  if (!("MediaRecorder" in window) || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const type of ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * host: what the presentation lends us.
 *  viewer, THREE, overlay (canvas above the stage), skin { name, model, data },
 *  scene(id) -> Promise (switches scene, builds the world), anim(id), world() -> McWorld|null,
 *  elytra(on) (temporarily), done() (restore everything)
 */
export class Cinema {
  constructor(host) {
    this.h = host;
    this.stopped = false;
    this.titles = [];      // { text, sub, from, to, big }
    this.flashAt = -1;
    this.bars = 0;
  }

  // ---------- frame loop, overlay and recording ----------
  start(kind, record) {
    const v = this.h.viewer;
    this.kind = kind;
    this.t0 = performance.now();
    this.prevRender = v.render;
    // every rendered frame: overlay on top, and into the recording
    v.render = () => {
      this.prevRender.call(v);
      if (this.stopped) return;
      this.frame();
      if (this.rec) this.capture();
    };
    if (record) this.startRecording(record);
    this.resizeOverlay();
    if (this.h.started) this.h.started(this);
    return new Promise(resolve => { this.resolve = resolve; });
  }
  resizeOverlay() {
    const o = this.h.overlay, c = this.h.viewer.canvas;
    o.width = c.width; o.height = c.height;
  }
  startRecording(type) {
    const gl = this.h.viewer.canvas;
    const k = Math.min(1, 1920 / Math.max(gl.width, gl.height));
    const c = this.recCanvas = document.createElement("canvas");
    c.width = Math.round(gl.width * k / 2) * 2; c.height = Math.round(gl.height * k / 2) * 2;
    this.recCtx = c.getContext("2d");
    const stream = c.captureStream(30);
    this.chunks = [];
    try {
      this.rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    } catch (e) { this.rec = null; return; }
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recType = type;
    this.rec.start(250);
  }
  capture() {
    const x = this.recCtx, c = this.recCanvas;
    x.drawImage(this.h.viewer.canvas, 0, 0, c.width, c.height);
    x.drawImage(this.h.overlay, 0, 0, c.width, c.height);
  }
  async stopRecording() {
    if (!this.rec) return;
    const rec = this.rec;
    this.rec = null;
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    const ext = this.recType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(this.chunks, { type: this.recType.split(";")[0] });
    return { blob, filename: `${(this.h.skin.name || "skin").replace(/[^\w\-]+/g, "_")}-${this.kind}.${ext}` };
  }
  /** Seconds since the start. */
  now() { return (performance.now() - this.t0) / 1000; }

  /** Letterbox bars, titles and flashes, drawn on the overlay canvas. */
  frame() {
    const o = this.h.overlay, x = o.getContext("2d"), W = o.width, H = o.height, t = this.now();
    if (o.width !== this.h.viewer.canvas.width || o.height !== this.h.viewer.canvas.height) this.resizeOverlay();
    x.clearRect(0, 0, W, H);
    this.update(t);
    if (this.stopped) { x.clearRect(0, 0, W, H); return; }   // the film ended in this frame
    const bar = H * 0.1 * this.bars;
    x.fillStyle = "#000"; x.fillRect(0, 0, W, bar); x.fillRect(0, H - bar, W, bar);
    for (const ti of this.titles) {
      if (t < ti.from || t > ti.to) continue;
      const k = clamp01((t - ti.from) / 0.45), out = clamp01((ti.to - t) / 0.35), a = Math.min(k, out);
      const size = (ti.big ? 0.11 : 0.05) * Math.min(W, H * 1.6);
      x.save();
      x.globalAlpha = a;
      x.textAlign = "center"; x.textBaseline = "middle";
      const y = ti.big ? H * 0.74 : H * 0.83;
      const scale = ti.big ? lerp(1.35, 1, ease(k)) : 1;
      x.translate(W / 2, y); x.scale(scale, scale);
      x.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
      x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = size * 0.3;
      x.fillStyle = "#fff";
      x.letterSpacing = ti.big ? `${size * 0.02}px` : "0px";
      x.fillText(ti.text, 0, 0);
      if (ti.sub) { x.font = `600 ${size * 0.32}px "Instrument Sans", system-ui, sans-serif`; x.fillStyle = "rgba(255,255,255,.85)"; x.fillText(ti.sub, 0, size * 0.85); }
      x.restore();
    }
    if (this.flashAt >= 0) {
      const f = 1 - clamp01((t - this.flashAt) / 0.35);
      if (f > 0) { x.fillStyle = `rgba(255,255,255,${f * 0.9})`; x.fillRect(0, 0, W, H); }
    }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const v = this.h.viewer;
    v.render = this.prevRender;
    const o = this.h.overlay; o.getContext("2d").clearRect(0, 0, o.width, o.height);
    this.cleanup && this.cleanup();
    this.stopRecording().catch(() => null).then(rec => { this.h.done(rec); this.resolve && this.resolve(); });
  }

  // ---------- camera helpers ----------
  /** Put the camera on a circle around the figure: angle (rad), height and distance in skin pixels. */
  cam(angle, height, dist, lookY = 0) {
    const v = this.h.viewer, c = v.camera, tg = v.controls.target;
    tg.set(0, lookY, 0);
    c.position.set(Math.sin(angle) * dist, height, Math.cos(angle) * dist);
    c.lookAt(tg);
  }
}

// ======================================================================================
// build film: blueprint figure, parts fly in, pixels get painted, name, cheer
// ======================================================================================
export async function buildFilm(host, record) {
  const cine = new Cinema(host);
  const { viewer: v, THREE } = host;
  const po = v.playerObject, sk = po.skin;
  host.anim(null);
  // the texture as it builds up: unpainted pixels are a blueprint grid
  const src = v.skinCanvas, W = src.width, H = src.height;
  const srcData = src.getContext("2d").getImageData(0, 0, W, H).data;
  const buildCanvas = document.createElement("canvas"); buildCanvas.width = W; buildCanvas.height = H;
  const bctx = buildCanvas.getContext("2d");
  const img = bctx.createImageData(W, H), D = img.data;
  const tex = new THREE.CanvasTexture(buildCanvas);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = v.skinTexture.colorSpace;
  const aw = sk.modelType === "slim" ? 3 : 4, sc = W / 64;
  const partOrder = Object.fromEntries(PARTS.map((p, i) => [p, i]));
  const TIMES = PARTS.map((p, i) => 0.6 + i * 0.55);     // when each part lands
  const reveal = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = faceAt(aw, Math.floor(x / sc), Math.floor(y / sc));
    const i = y * W + x;
    if (!f) { reveal[i] = 0; continue; }
    // after its part has landed, from the bottom of the face up, with a little randomness
    const fy = (Math.floor(y / sc) - f.rect[1]) / Math.max(1, f.rect[3]);
    reveal[i] = TIMES[partOrder[f.part]] + 0.4 + (1 - fy) * 1.2 + Math.random() * 0.6 + (f.layer === "outer" ? 0.8 : 0);
  }
  const paintUpTo = t => {
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      if (t >= reveal[i]) { D[j] = srcData[j]; D[j + 1] = srcData[j + 1]; D[j + 2] = srcData[j + 2]; D[j + 3] = srcData[j + 3]; }
      else {
        const x = i % W, y = Math.floor(i / W), grid = (Math.floor(x / sc) + Math.floor(y / sc)) % 2;
        // blueprint: base layer as a blue grid, outer layer not there yet
        const outer = srcData[j + 3] < 255 || (faceAt(aw, Math.floor(x / sc), Math.floor(y / sc)) || {}).layer === "outer";
        if (outer) { D[j + 3] = 0; continue; }
        D[j] = grid ? 34 : 44; D[j + 1] = grid ? 66 : 84; D[j + 2] = grid ? 120 : 150; D[j + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
    tex.needsUpdate = true;
  };
  paintUpTo(0);
  sk.map = tex;
  // remember where every part belongs
  const rest = PARTS.map(p => [sk[p], sk[p].position.clone()]);
  const dirs = PARTS.map((p, i) => new THREE.Vector3(Math.sin(i * 2.1) * 60, 40 + (i % 3) * 18, Math.cos(i * 1.7) * 60));
  // a burst of pixels when a part lands
  const burst = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 1.2, vertexColors: true, transparent: true, depthWrite: false }));
  const N = 60 * PARTS.length, bp = new Float32Array(N * 3), bc = new Float32Array(N * 3), bv = [];
  for (let i = 0; i < N; i++) {
    const k = Math.floor(Math.random() * W * H) * 4;
    bc.set([srcData[k] / 255, srcData[k + 1] / 255, srcData[k + 2] / 255], i * 3);
    bv.push(new THREE.Vector3((Math.random() - 0.5) * 30, Math.random() * 24 + 6, (Math.random() - 0.5) * 30));
  }
  burst.geometry.setAttribute("position", new THREE.BufferAttribute(bp, 3));
  burst.geometry.setAttribute("color", new THREE.BufferAttribute(bc, 3));
  burst.frustumCulled = false;
  v.playerWrapper.add(burst);
  const landY = { rightLeg: -12, leftLeg: -12, body: 0, rightArm: 2, leftArm: 2, head: 10 };
  const END = TIMES[TIMES.length - 1] + 4.6, CHEER = END - 2.6;
  cine.cleanup = () => {
    for (const [o, p] of rest) { o.position.copy(p); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); o.visible = true; }
    sk.map = v.skinTexture;
    tex.dispose();
    v.playerWrapper.remove(burst); burst.geometry.dispose(); burst.material.dispose();
  };
  let painted = -1, cheered = false;
  cine.titles.push({ text: host.skin.name, sub: t("cineBuilt"), from: END - 2.4, to: END + 1, big: true });
  cine.update = time => {
    cine.bars = ease(clamp01(time / 0.8)) * (1 - clamp01((time - END + 0.4) / 0.4));
    PARTS.forEach((p, i) => {
      const [o, pos] = rest[i], land = TIMES[i], k = clamp01((time - (land - 0.7)) / 0.7);
      o.visible = time >= land - 0.7;
      const e = ease(k);
      o.position.copy(pos).addScaledVector(dirs[i], 1 - e);
      o.rotation.set((1 - e) * 3, (1 - e) * 5, (1 - e) * 2);
      const bounce = time > land ? 1 + Math.sin(clamp01((time - land) / 0.3) * Math.PI) * 0.12 : 1;
      o.scale.setScalar(bounce);
    });
    // pixel bursts
    const a = burst.geometry.attributes.position;
    for (let i = 0; i < N; i++) {
      const part = Math.floor(i / 60), age = time - TIMES[part];
      if (age < 0 || age > 1.1) { a.setXYZ(i, 0, -999, 0); continue; }
      const vv = bv[i];
      a.setXYZ(i, vv.x * age, landY[PARTS[part]] + vv.y * age - 30 * age * age, vv.z * age);
    }
    a.needsUpdate = true;
    if (Math.floor(time * 20) !== painted) { painted = Math.floor(time * 20); paintUpTo(time); }
    // camera: circles while it builds, then comes to the front for the name
    const ang = time < CHEER ? 2.2 - time * 0.55 : lerp(2.2 - CHEER * 0.55, 0, easeInOut(clamp01((time - CHEER) / 1.4)));
    const dist = lerp(95, 70, easeInOut(clamp01(time / END)));
    cine.cam(ang, lerp(30, 6, easeInOut(clamp01(time / CHEER))), dist, -2);
    if (time > CHEER && !cheered) { cheered = true; sk.map = v.skinTexture; host.anim("cheer"); }
    if (time > END + 1) cine.stop();
  };
  return cine.start("build", record);
}

// ======================================================================================
// trailer: quick cuts through the block worlds, captions, a big name at the end
// ======================================================================================
export async function trailer(host, record) {
  const cine = new Cinema(host);
  const SHOTS = [
    { look: "mc-dark", anim: "idle", dur: 3.2, cap: "trailer1", cam: k => [0.2 + k * 0.3, 10 - k * 4, lerp(40, 26, k), 10] },
    { look: "mc-sunrise", anim: "run", dur: 3.0, cap: "trailer2", cam: k => [-1.2 + k * 1.6, -10 + k * 6, 70, 0] },
    { look: "mc-night", anim: "fly", dur: 3.2, cap: "trailer3", elytra: true, cam: k => [k * 3.4, 14, 75, 0] },
    { look: "mc-white", anim: "swing", dur: 3.0, cap: "trailer4", cam: k => [0.7 - k * 0.2, 4, lerp(60, 44, ease(k)) + Math.sin(k * 40) * 0.8, 2] },
    { look: "mc-sunrise", anim: "dance", dur: 3.2, cap: "trailer5", speed: 0.45, cam: k => [-0.6 + k * 1.2, 2, 62, 0] },
    { look: "mc-dark", anim: "cheer", dur: 4.4, name: true, cam: k => [0, 6, lerp(90, 66, ease(k)), 0] },
  ];
  // build every world once before the clock starts, so cuts do not stall
  for (const id of ["mc-white", "mc-dark", "mc-sunrise", "mc-night"]) await host.scene(id);
  let at = 0;
  const starts = SHOTS.map(s => { const a = at; at += s.dur; return a; }), END = at;
  SHOTS.forEach((s, i) => {
    if (s.cap) cine.titles.push({ text: t(s.cap), from: starts[i] + 0.35, to: starts[i] + s.dur - 0.25 });
    if (s.name) cine.titles.push({ text: host.skin.name, sub: t("trailerEnd"), from: starts[i] + 0.6, to: END + 0.6, big: true });
  });
  let shot = -1;
  cine.cleanup = () => { host.elytra(null); };
  cine.update = time => {
    cine.bars = ease(clamp01(time / 0.6));
    const i = starts.findIndex((s, j) => time >= s && (j === SHOTS.length - 1 || time < starts[j + 1]));
    if (i !== shot && i >= 0) {
      shot = i;
      const s = SHOTS[i];
      cine.flashAt = time;
      host.sceneNow(s.look);
      host.elytra(s.elytra ? true : null);
      host.anim(s.anim, s.speed || 1);
    }
    const s = SHOTS[shot], k = clamp01((time - starts[shot]) / s.dur);
    const [ang, h, dist, ly] = s.cam(k);
    cine.cam(ang, h, dist, ly);
    if (time > END + 0.6) cine.stop();
  };
  return cine.start("trailer", record);
}
