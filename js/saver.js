// Saving pictures and videos: a small window shows progress while the file is made, then a preview
// with a "Save" link. The download starts from that click, which browsers always allow (an automatic
// download after a long wait is often blocked or ends up unnoticed).
import { t } from "./i18n.js";
import { $ } from "./dom.js";

let url = null, seq = 0;
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

function progress(p) {
  const bar = $("svBar");
  if (p < 0 || p == null) bar.removeAttribute("value"); else bar.value = p;
  $("svPct").textContent = p >= 0 ? Math.round(p * 100) + " %" : "";
}
function cleanup() {
  if (url) { URL.revokeObjectURL(url); url = null; }
  $("svImg").removeAttribute("src"); $("svVid").removeAttribute("src"); $("svVid").load();
}

/**
 * title: heading; filename; make(progress) -> Promise<Blob> (progress takes 0..1, or -1 for "working").
 * Resolves when the window is closed.
 */
export async function saveWithPreview({ title, filename, make }) {
  const my = ++seq, d = $("saver");
  cleanup();
  $("svTitle").textContent = title;
  $("svBusy").hidden = false; $("svDone").hidden = true; $("svErr").hidden = true;
  $("svMsg").textContent = t("saveMaking");
  progress(-1);
  if (!d.open) d.showModal();
  await nextFrame();   // let the window appear before the heavy work starts
  let blob;
  try { blob = await make(progress); }
  catch (e) {
    console.error("[skin-library] could not make the file:", e);
    if (my !== seq) return;
    $("svBusy").hidden = true; $("svErr").hidden = false;
    return;
  }
  if (my !== seq || !d.open) return;
  url = URL.createObjectURL(blob);
  const video = blob.type.startsWith("video/");
  $("svImg").hidden = video; $("svVid").hidden = !video;
  if (video) { $("svVid").src = url; $("svVid").play().catch(() => {}); } else $("svImg").src = url;
  const a = $("svSave");
  a.href = url; a.download = filename;
  const kb = blob.size / 1024;
  $("svInfo").textContent = `${filename} · ${kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(kb)) + " KB"}`;
  // phones: hand the file to the system share sheet (photos, messengers)
  const file = new File([blob], filename, { type: blob.type });
  $("svShare").hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $("svShare").onclick = () => navigator.share({ files: [file], title }).catch(() => {});
  $("svBusy").hidden = true; $("svDone").hidden = false;
  a.focus();
}

export function setupSaver() {
  const d = $("saver");
  const close = () => { seq++; if (d.open) d.close(); };
  $("svClose").addEventListener("click", close);
  $("svX").addEventListener("click", close);
  d.addEventListener("close", cleanup);
  d.addEventListener("click", e => { if (e.target === d) close(); });
  $("svSave").addEventListener("click", () => { $("svSaved").hidden = false; setTimeout(() => { $("svSaved").hidden = true; }, 2500); });
}

/** canvas.toBlob as a promise. */
export const canvasBlob = (c, type = "image/png") => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("toBlob")), type));
