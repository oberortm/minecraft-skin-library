// Sharing a skin without a server: the whole skin travels in the link (after "#", so it is never sent
// to any server, not even GitHub Pages). Format: "#S=" + base32 (0-9 A-V, fits the QR code's compact
// alphanumeric mode) of: version, flags, name, then either the PNG or the pixels compressed with deflate,
// whichever is smaller.
import { faceList, legacyTo64, loadImage } from "./skin.js";
import { encodeSegments } from "./qr.js";

const B32 = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
const VERSION = 1;

function toB32(bytes) {
  let out = "", acc = 0, bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b; bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(acc >>> bits) & 31]; }
    acc &= (1 << bits) - 1;
  }
  if (bits) out += B32[(acc << (5 - bits)) & 31];
  return out;
}
function fromB32(text) {
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of text.toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error("bad link");
    acc = (acc << 5) | v; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 255); acc &= (1 << bits) - 1; }
  }
  return new Uint8Array(out);
}
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** The share code of a skin (base32 text). */
export async function encodeSkin(skin) {
  const img = await loadImage(skin.data);
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.drawImage(img.height === 32 ? legacyTo64(img) : img, 0, 0);
  const px = ctx.getImageData(0, 0, 64, 64).data;
  // pixels outside the skin's faces never show: leave them out; channels one after another compress best
  const used = new Uint8Array(64 * 64);
  for (const f of faceList(skin.model === "slim" ? 3 : 4)) { const [x0, y0, w, h] = f.rect; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) used[y * 64 + x] = 1; }
  const planar = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const a = used[i] ? px[i * 4 + 3] : 0;
    for (let ch = 0; ch < 3; ch++) planar[ch * 4096 + i] = a ? px[i * 4 + ch] : 0;
    planar[3 * 4096 + i] = a;
  }
  let raw = null;
  if ("CompressionStream" in window) raw = await pipe(planar, new CompressionStream("deflate-raw"));
  const png = Uint8Array.from(atob(skin.data.split(",")[1]), ch => ch.charCodeAt(0));
  const useRaw = raw && raw.length < png.length;
  const name = new TextEncoder().encode((skin.name || "").slice(0, 40));
  const head = [VERSION, (skin.model === "slim" ? 1 : 0) | (useRaw ? 2 : 0), name.length];
  const out = new Uint8Array(head.length + name.length + (useRaw ? raw.length : png.length));
  out.set(head, 0); out.set(name, head.length); out.set(useRaw ? raw : png, head.length + name.length);
  return toB32(out);
}

/** Back from a share code: { name, model, data (PNG data URL) }. Throws on a broken link. */
export async function decodeSkin(code) {
  const b = fromB32(code);
  if (b[0] !== VERSION) throw new Error("version");
  const flags = b[1], nl = b[2];
  const name = new TextDecoder().decode(b.subarray(3, 3 + nl)), body = b.subarray(3 + nl);
  let data;
  if (flags & 2) {
    const planar = await pipe(body, new DecompressionStream("deflate-raw"));
    if (planar.length !== 64 * 64 * 4) throw new Error("size");
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const ctx = c.getContext("2d"), img = ctx.createImageData(64, 64);
    for (let i = 0; i < 4096; i++) for (let ch = 0; ch < 4; ch++) img.data[i * 4 + ch] = planar[ch * 4096 + i];
    ctx.putImageData(img, 0, 0);
    data = c.toDataURL("image/png");
  } else {
    let s = ""; for (const x of body) s += String.fromCharCode(x);
    data = "data:image/png;base64," + btoa(s);
  }
  return { name, model: flags & 1 ? "slim" : "classic", data };
}

/** Link to this page that carries the skin. */
export const shareBase = () => location.origin + location.pathname + "#S=";
/** The QR code of a share link, or null when the skin is too detailed for one. */
export function shareQR(code) {
  return encodeSegments([{ mode: "byte", data: new TextEncoder().encode(shareBase()) }, { mode: "alnum", text: code }]);
}
/** The share code in the current address, if any. */
export function codeInAddress() {
  const m = /^#S=([0-9A-V]+)$/i.exec(location.hash);
  return m ? m[1] : null;
}
