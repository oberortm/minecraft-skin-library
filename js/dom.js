// Small DOM helpers that never throw on a missing element.
// A stale cached index.html (or a typo) must not take every button down with it,
// so a missing id gives a detached stand-in element and one console warning.
const warned = new Set();

export function $(id) {
  const el = document.getElementById(id);
  if (el) return el;
  if (!warned.has(id)) { warned.add(id); console.warn(`[skin-library] element #${id} is missing`); }
  return document.createElement(id === "detail" || id === "editor" ? "dialog" : "div");
}

/** addEventListener by id. */
export function on(id, type, fn, opts) {
  $(id).addEventListener(type, fn, opts);
}

let report = null;
/** Where errors from safe() go (the app's toast). */
export function setErrorReporter(fn) { report = fn; }

/** Run one part of the start-up; if it fails, log it, tell the user and carry on with the rest. */
export function safe(label, fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === "function") r.catch(e => fail(label, e));
    return r;
  } catch (e) { fail(label, e); return undefined; }
}
function fail(label, e) {
  console.error(`[skin-library] ${label} failed:`, e);
  if (report) report(label, e);
}
