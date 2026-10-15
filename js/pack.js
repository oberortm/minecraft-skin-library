// Texture sources for the Minecraft scenes. By default everything is drawn in code (mcworld.js).
// On request the browser downloads the original textures straight from the official source
// (Mojang's game files, or a resource pack on Modrinth) or reads a pack the user picks. Only the
// few textures the scenes use are unpacked and kept in this browser (its own IndexedDB, separate
// from the skins). Nothing is part of this website or uploaded anywhere.

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
  // equipment for the presentation figure
  elytra: [["entity/equipment/wings/elytra", "entity/elytra"]],
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

/** Pick the textures we use out of a pack/jar. Returns { name, blobs: { texName: Blob } }. */
export async function readPackBuffer(buf, name) {
  if (!("DecompressionStream" in window)) throw new Error("unsupported");
  const want = n => /assets\/minecraft\/textures\/[^]+\.png$/i.test(n) && Object.values(FILES).some(([paths]) => paths.some(p => n.toLowerCase().endsWith("assets/minecraft/textures/" + p + ".png")));
  const files = await readZip(buf, want);
  const blobs = {};
  for (const [tex, [paths]] of Object.entries(FILES)) {
    for (const path of paths) {
      const hit = [...files.keys()].find(n => n.toLowerCase().endsWith("assets/minecraft/textures/" + path + ".png"));
      if (hit) { blobs[tex] = new Blob([files.get(hit)], { type: "image/png" }); break; }
    }
  }
  if (!Object.keys(blobs).length) throw new Error("no textures");
  return { name, blobs };
}

/** Read a resource pack file the user picked. */
export async function readPack(file) {
  return readPackBuffer(await file.arrayBuffer(), file.name.replace(/\.zip$/i, ""));
}

// ---------- downloadable sources ----------
/** What the texture menu offers. "builtin" = drawn in code, "file" = a .zip the user picks. */
export const SOURCES = [
  { id: "builtin" },
  { id: "vanilla", name: "Minecraft", page: "https://www.minecraft.net/" },
  { id: "faithful", name: "Faithful 32x", slug: "faithful-32x", page: "https://modrinth.com/resourcepack/faithful-32x" },
  { id: "barebones", name: "Bare Bones", slug: "bare-bones", page: "https://modrinth.com/resourcepack/bare-bones" },
  { id: "staytrue", name: "Stay True", slug: "stay-true", page: "https://www.curseforge.com/minecraft/texture-packs/stay-true" },
  { id: "file" },
];

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

/** Download with progress (0..1, or -1 when the size is unknown). */
async function fetchBytes(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error("http " + r.status);
  const total = Number(r.headers.get("content-length")) || 0, reader = r.body.getReader(), parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); got += value.length;
    onProgress(total ? got / total : -1);
  }
  const out = new Uint8Array(got);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

/** The newest release's client.jar from Mojang, which holds the original textures. */
async function vanillaUrl() {
  const manifest = await fetchJson("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
  const id = manifest.latest.release;
  const ver = await fetchJson(manifest.versions.find(v => v.id === id).url);
  return { url: ver.downloads.client.url, name: "Minecraft " + id };
}

/** The newest file of a resource pack on Modrinth (found by slug, else by name). */
async function modrinthUrl(src) {
  const api = "https://api.modrinth.com/v2";
  let slug = src.slug, versions;
  try { versions = await fetchJson(`${api}/project/${slug}/version`); }
  catch (e) {
    const q = encodeURIComponent(src.name), facets = encodeURIComponent('[["project_type:resourcepack"]]');
    const hit = (await fetchJson(`${api}/search?query=${q}&facets=${facets}`)).hits.find(h => h.title.toLowerCase() === src.name.toLowerCase());
    if (!hit) throw new Error("not found");
    slug = hit.slug; versions = await fetchJson(`${api}/project/${slug}/version`);
  }
  const files = versions[0] && versions[0].files;
  const file = files && (files.find(f => f.primary) || files[0]);
  if (!file) throw new Error("no file");
  return { url: file.url, name: src.name };
}

/** Download a source and unpack the textures we need. onProgress(0..1). */
export async function downloadSource(id, onProgress) {
  const src = SOURCES.find(s => s.id === id);
  const { url, name } = id === "vanilla" ? await vanillaUrl() : await modrinthUrl(src);
  const buf = await fetchBytes(url, p => onProgress(p));
  onProgress(1);
  return readPackBuffer(buf, name);
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
const SOURCE_KEY = "skin-library-texture-source";
/** Which source is selected ("builtin" by default; an older single saved pack counts as "file"). */
export async function selectedSource() {
  try { const v = localStorage.getItem(SOURCE_KEY); if (SOURCES.some(s => s.id === v)) return v; } catch (e) { /* ignore */ }
  const old = await tx("readonly", st => st.get("current")).catch(() => null);
  return old ? "file" : "builtin";
}
export function selectSource(id) { try { localStorage.setItem(SOURCE_KEY, id); } catch (e) { /* ignore */ } }
/** Stored packs, one per source; "file" also finds the pack saved by earlier versions. */
export const savePack = (id, pack) => tx("readwrite", st => st.put(pack, id === "file" ? "current" : id));
export const loadPack = id => tx("readonly", st => st.get(id === "file" ? "current" : id)).catch(() => null);
export const clearPack = id => tx("readwrite", st => st.delete(id === "file" ? "current" : id));
