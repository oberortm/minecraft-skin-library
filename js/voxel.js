// Voxel figure for profile pictures: the base layer as textured boxes, every pixel of the outer layer
// as its own little cube standing out of the surface (hair, glasses, jackets look solid). Optionally
// "chibi": a big head on a small body. Rendered once into a square canvas with soft studio light.
import { parts } from "./skin.js";

const SIDES = ["front", "back", "top", "bottom", "right", "left"];

/** Where each pixel of a face sits in 3D, for a box of size w x h x d centred at the origin (front = +z). */
function pixelPos(side, i, j, w, h, d) {
  const o = 0.5;   // cubes of the outer layer sit just on top of the surface
  switch (side) {
    case "front": return [-w / 2 + i + 0.5, h / 2 - j - 0.5, d / 2 + o];
    case "back": return [w / 2 - i - 0.5, h / 2 - j - 0.5, -d / 2 - o];
    case "right": return [-w / 2 - o, h / 2 - j - 0.5, -d / 2 + i + 0.5];
    case "left": return [w / 2 + o, h / 2 - j - 0.5, d / 2 - i - 0.5];
    case "top": return [-w / 2 + i + 0.5, h / 2 + o, -d / 2 + j + 0.5];
    default: return [-w / 2 + i + 0.5, -h / 2 - o, d / 2 - j - 0.5];
  }
}

/** Box UVs in skinview3d's face order (+x right side … ) for the 64x64 skin layout. */
function boxUVs(geo, u, v, w, h, d) {
  const T = 64, f = (x1, y1, x2, y2) => [[x1 / T, 1 - y2 / T], [x2 / T, 1 - y2 / T], [x2 / T, 1 - y1 / T], [x1 / T, 1 - y1 / T]];
  const top = f(u + d, v, u + w + d, v + d), bottom = f(u + w + d, v, u + 2 * w + d, v + d);
  const left = f(u, v + d, u + d, v + d + h), front = f(u + d, v + d, u + w + d, v + d + h);
  const right = f(u + w + d, v + d, u + w + 2 * d, v + h + d), back = f(u + w + 2 * d, v + d, u + 2 * w + 2 * d, v + h + d);
  const order = [[right[3], right[2], right[0], right[1]], [left[3], left[2], left[0], left[1]], [top[3], top[2], top[0], top[1]],
    [bottom[0], bottom[1], bottom[3], bottom[2]], [front[3], front[2], front[0], front[1]], [back[3], back[2], back[0], back[1]]];
  geo.attributes.uv.set(new Float32Array(order.flat(2)));
}

/**
 * Build the voxel figure. tex: 64x64 skin canvas; slim: arm width 3; chibi: big head.
 * Returns a THREE.Group, feet at y = 0, front towards +z.
 */
export function buildVoxelFigure(THREE, tex, slim, chibi) {
  const aw = slim ? 3 : 4, data = tex.getContext("2d").getImageData(0, 0, 64, 64).data;
  const map = new THREE.CanvasTexture(tex);
  map.magFilter = map.minFilter = THREE.NearestFilter; map.colorSpace = THREE.SRGBColorSpace; map.generateMipmaps = false;
  const baseMat = new THREE.MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const voxMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const root = new THREE.Group();
  // centres of the parts (skin pixels), feet on y = 0
  const hs = chibi ? 1.45 : 1, bs = chibi ? 0.72 : 1;
  const legH = 12 * bs, bodyH = 12 * bs;
  const place = {
    rightLeg: [-2 * bs, legH / 2, 0, bs], leftLeg: [2 * bs, legH / 2, 0, bs],
    body: [0, legH + bodyH / 2, 0, bs],
    rightArm: [-(4 + aw / 2) * bs, legH + bodyH / 2, 0, bs], leftArm: [(4 + aw / 2) * bs, legH + bodyH / 2, 0, bs],
    head: [0, legH + bodyH + 4 * hs, 0, hs],
  };
  const all = parts(aw), color = new THREE.Color();
  for (const id of Object.keys(place)) {
    const [x, y, z, s] = place[id];
    const g = new THREE.Group();
    g.position.set(x, y, z); g.scale.setScalar(s);
    const base = all.find(p => p.id === id && p.layer === "base"), outer = all.find(p => p.id === id && p.layer === "outer");
    const [u, v, w, h, d] = base.box;
    const geo = new THREE.BoxGeometry(w, h, d); boxUVs(geo, u, v, w, h, d);
    g.add(new THREE.Mesh(geo, baseMat));
    // outer layer: one cube per visible pixel
    const cells = [];
    for (const side of SIDES) {
      const [fx, fy, fw, fh] = outer.faces[side];
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        const k = ((fy + j) * 64 + fx + i) * 4;
        if (data[k + 3] < 40) continue;
        cells.push([pixelPos(side, i, j, w, h, d), data[k], data[k + 1], data[k + 2]]);
      }
    }
    if (cells.length) {
      const inst = new THREE.InstancedMesh(cube, voxMat, cells.length), m = new THREE.Matrix4();
      cells.forEach(([p, r, gg, b], n) => {
        m.makeTranslation(p[0], p[1], p[2]);
        inst.setMatrixAt(n, m);
        inst.setColorAt(n, color.setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace));
      });
      g.add(inst);
    }
    g.name = id;
    root.add(g);
  }
  root.userData.dispose = () => { map.dispose(); baseMat.dispose(); voxMat.dispose(); cube.dispose(); root.traverse(o => { if (o.isMesh && o.geometry !== cube) o.geometry.dispose(); }); };
  return root;
}

let renderer = null;
/** Render a group into a square canvas. frame: "head" | "bust" | "full"; angle: true for a three-quarter view. */
export function renderVoxel(THREE, group, size, frame, angle) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f9c, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-30, 60, 70); scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff1dd, 0.7); rim.position.set(60, 30, -50); scene.add(rim);
  scene.add(group);
  group.updateMatrixWorld(true);
  // frame the chosen part
  const box = new THREE.Box3();
  const head = group.getObjectByName("head"), body = group.getObjectByName("body");
  if (frame === "head") box.setFromObject(head);
  else if (frame === "bust") {
    box.setFromObject(head);
    for (const n of ["body", "rightArm", "leftArm"]) box.expandByObject(group.getObjectByName(n));
    const b = new THREE.Box3().setFromObject(body);
    box.min.y = b.min.y + (b.max.y - b.min.y) * 0.3;
  } else box.setFromObject(group);
  const c = box.getCenter(new THREE.Vector3()), dim = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(24, 1, 1, 2000);
  const half = Math.max(dim.x, dim.y) / 2 * ({ head: 1.45, bust: 1.1, full: 1.15 })[frame];
  const dist = half / Math.tan(12 * Math.PI / 180) + dim.z / 2;
  if (frame === "bust") c.y = box.min.y + half * 0.96;
  const a = angle ? -0.6 : 0;
  cam.position.set(c.x + Math.sin(a) * dist, c.y + (angle ? dist * 0.16 : 0), c.z + Math.cos(a) * dist);
  cam.lookAt(c);
  renderer.render(scene, cam);
  scene.remove(group);
  return renderer.domElement;
}
