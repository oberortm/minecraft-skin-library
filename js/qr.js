// A small QR code generator (model 2, error correction level L, versions 1-40), written for this page
// so no outside service sees the shared skin. Segments: byte mode and alphanumeric mode.
// Follows the structure of the QR specification (ISO/IEC 18004).

const ECC_PER_BLOCK = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
const NUM_BLOCKS = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];
export const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
function rsRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    div.forEach((d, i) => { r[i] ^= gfMul(d, f); });
  }
  return r;
}

/** segments: [{ mode: "byte", data: Uint8Array } | { mode: "alnum", text: string }] -> boolean[][] (true = dark) */
export function encodeSegments(segments) {
  const bitsFor = ver => {
    let n = 0;
    for (const s of segments) {
      const cc = s.mode === "byte" ? (ver < 10 ? 8 : 16) : (ver < 10 ? 9 : ver < 27 ? 11 : 13);
      n += 4 + cc + (s.mode === "byte" ? s.data.length * 8 : Math.floor(s.text.length / 2) * 11 + (s.text.length % 2) * 6);
    }
    return n;
  };
  let ver = 1;
  for (; ver <= 40; ver++) if (bitsFor(ver) <= dataCodewords(ver) * 8) break;
  if (ver > 40) return null;
  // bit stream
  const bits = [];
  const put = (v, len) => { for (let i = len - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  for (const s of segments) {
    if (s.mode === "byte") { put(4, 4); put(s.data.length, ver < 10 ? 8 : 16); for (const b of s.data) put(b, 8); }
    else {
      put(2, 4); put(s.text.length, ver < 10 ? 9 : ver < 27 ? 11 : 13);
      for (let i = 0; i + 1 < s.text.length; i += 2) put(ALNUM.indexOf(s.text[i]) * 45 + ALNUM.indexOf(s.text[i + 1]), 11);
      if (s.text.length % 2) put(ALNUM.indexOf(s.text[s.text.length - 1]), 6);
    }
  }
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // error correction blocks, interleaved
  const nb = NUM_BLOCKS[ver], ecLen = ECC_PER_BLOCK[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(-1);   // placeholder so all blocks line up when interleaving
    blocks.push(dat.concat(ecc));
  }
  const cw = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecLen || j >= nShort) cw.push(b[i]); });
  // the symbol
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && y >= 0 && x < size && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const align = [];
  if (ver > 1) {
    const n = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    align.push(6);
    for (let p = ver * 4 + 10; align.length < n; p -= step) align.splice(1, 0, p);
  }
  for (let i = 0; i < align.length; i++) for (let j = 0; j < align.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const d = (1 << 3) | mask;   // level L = 01
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  // data in the zig-zag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    const line = get => {
      let run = 1, s = 0;
      for (let k = 1; k < size; k++) { if (get(k) === get(k - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; }
      // finder-like 1011101 with light on one side
      for (let k = 0; k + 10 < size; k++) {
        const w = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], v2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
        if (w.every((b, q) => get(k + q) === !!b) || v2.every((b, q) => get(k + q) === !!b)) s += 40;
      }
      return s;
    };
    for (let y = 0; y < size; y++) p += line(x => mod[y][x]);
    for (let x = 0; x < size; x++) p += line(y => mod[y][x]);
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    for (const row of mod) for (const c of row) if (c) dark++;
    const total = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestP) { bestP = p; best = m; }
    applyMask(m);   // undo (masking twice restores)
  }
  applyMask(best); drawFormat(best);
  return mod;
}

/** Draw a QR matrix on a canvas: scale px per module, with the quiet zone of 4 modules. */
export function drawQR(canvas, mod, scale = 4) {
  const n = mod.length + 8;
  canvas.width = canvas.height = n * scale;
  const x = canvas.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, canvas.width, canvas.height);
  x.fillStyle = "#000";
  mod.forEach((row, j) => row.forEach((d, i) => { if (d) x.fillRect((i + 4) * scale, (j + 4) * scale, scale, scale); }));
}
