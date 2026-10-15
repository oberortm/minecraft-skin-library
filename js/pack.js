// Optional resource pack for the Minecraft scenes. The user picks a pack (.zip) from their own
// Minecraft install; only the few block textures the scenes use are unpacked and kept in this
// browser (its own IndexedDB, separate from the skins). Nothing is uploaded or published.

const DB_NAME = "skin-library-pack";
const STORE = "pack";

/** Our texture names -> file names in a pack (1.13+ first, then the old 1.8-1.12 names), plus tint. */
const FILES = {
  grassTop: [["block/grass_block_top", "blocks/grass_top"], "#7cbd56"],
  grassSide: [["block/grass_block_side", "blocks/grass_side"]],
  dirt: [["block/dirt", "blocks/dirt"]],
  stone: [["block/stone", "blocks/stone"]],
  sand: [["block/sand", "blocks/sand"]],
  logSide: [["block/oak_log", "blocks/log_oak"]],
  logTop: [["block/oak_log_top", "blocks/log_oak_top"]],
  leaves: [["block/oak_leaves", "blocks/leaves_oak"], "#5fa83a"],
  water: [["block/water_still", "blocks/water_still"], "#3f76e4"],
  quartz: [["block/quartz_block_side", "blocks/quartz_block_side"]],
  quartzTile: [["block/quartz_block_top", "blocks/quartz_block_top"]],
  pillar: [["block/quartz_pillar", "blocks/quartz_block_lines"]],
  dark: [["block/blackstone", "block/deepslate", "blocks/stone_andesite"]],
  darkBrick: [["block/polished_blackstone_bricks", "block/deepslate_bricks", "blocks/stonebrick"]],
  darkPolished: [["block/polished_blackstone", "block/polished_deepslate", "blocks/stone_andesite_smooth"]],
};

// ---------- tiny zip reader (stored + deflate), enough for resource packs ----------
async function inflate(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

async function readZip(buf, wanted) {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip");
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true), dec = new TextDecoder(), out = new Map();
  for (let k = 0; k < count && v.getUint32(p, true) === 0x02014b50; k++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = u8.subarray(start, start + size);
    if (method === 0) out.set(name, data.slice());
    else if (method === 8) out.set(name, await inflate(data));
  }
  return out;
}

/** Turn a pack image into a square canvas (first frame of animations), tinted where the game tints it. */
async function toCanvas(blob, tint) {
  const bmp = await createImageBitmap(blob);
  const s = bmp.width;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, s, s, 0, 0, s, s);
  if (tint) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tint; ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(bmp, 0, 0, s, s, 0, 0, s, s);
  }
  bmp.close && bmp.close();
  return c;
}

/** Read a resource pack file; returns { name, blobs: { texName: Blob } } with the textures it has. */
export async function readPack(file) {
  if (!("DecompressionStream" in window)) throw new Error("unsupported");
  const want = name => /assets\/minecraft\/textures\/blocks?\/[^/]+\.png$/i.test(name);
  const files = await readZip(await file.arrayBuffer(), want);
  const blobs = {};
  for (const [tex, [paths]] of Object.entries(FILES)) {
    for (const path of paths) {
      const hit = [...files.keys()].find(n => n.toLowerCase().endsWith("assets/minecraft/textures/" + path + ".png"));
      if (hit) { blobs[tex] = new Blob([files.get(hit)], { type: "image/png" }); break; }
    }
  }
  if (!Object.keys(blobs).length) throw new Error("no textures");
  return { name: file.name.replace(/\.zip$/i, ""), blobs };
}

/** Decode stored blobs into canvases for the world. */
export async function packCanvases(pack) {
  const out = {};
  for (const [tex, blob] of Object.entries(pack.blobs)) {
    try { out[tex] = await toCanvas(blob, FILES[tex][1]); } catch (e) { /* skip a broken image */ }
  }
  return out;
}

// ---------- storage ----------
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}
export const savePack = pack => tx("readwrite", s => s.put(pack, "current"));
export const loadPack = () => tx("readonly", s => s.get("current")).catch(() => null);
export const clearPack = () => tx("readwrite", s => s.delete("current"));
