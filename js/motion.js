// Scroll reveals, pointer tilt and the scroll progress variable used by the motion looks.
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let io = null;

/** Cards fly in once when they enter the viewport. */
export function reveal(cards) {
  if (io) io.disconnect();
  if (reduce() || !("IntersectionObserver" in window)) { cards.forEach(c => c.classList.add("in", "vis")); return; }
  // "in" is added once (fly-in); "vis" follows visibility so off-screen cards can stop animating
  io = new IntersectionObserver(entries => {
    for (const e of entries) {
      e.target.classList.toggle("vis", e.isIntersecting);
      if (e.isIntersecting) e.target.classList.add("in");
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.12 });
  let col = 0, lastTop = null;
  cards.forEach(c => {
    c.classList.add("rv");
    // stagger by position in the row so a row ripples in from left to right
    const top = c.offsetTop;
    col = top === lastTop ? col + 1 : 0; lastTop = top;
    c.style.setProperty("--i", String(col));
    io.observe(c);
  });
}

/** Pointer position over a card as -1..1, for tilt and for turning the 3D figure. */
export function bindTilt(card) {
  if (reduce()) return;
  card.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    card.style.setProperty("--my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    card.classList.add("hot");
  });
  card.addEventListener("pointerleave", () => {
    card.style.setProperty("--mx", "0"); card.style.setProperty("--my", "0");
    card.classList.remove("hot");
  });
}

/** --scroll on <html>: 0 at the top, 1 after one viewport height. */
export function trackScroll() {
  let ticking = false;
  const set = () => {
    ticking = false;
    const v = Math.min(1, (window.scrollY || 0) / Math.max(1, innerHeight));
    document.documentElement.style.setProperty("--scroll", v.toFixed(4));
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(set); } }, { passive: true });
  set();
}

/** Split the page title into letters so looks can animate them in. */
export function splitTitle(el) {
  if (el.dataset.split) return;
  const text = el.textContent;
  el.dataset.split = "1";
  el.setAttribute("aria-label", text);
  el.textContent = "";
  [...text].forEach((ch, i) => {
    const s = document.createElement("span");
    s.className = "ch";
    s.setAttribute("aria-hidden", "true");
    s.style.setProperty("--i", String(i));
    s.textContent = ch === " " ? " " : ch;
    el.appendChild(s);
  });
}
