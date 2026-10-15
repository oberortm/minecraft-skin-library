// Look (visual theme) handling. Each look has a light and a dark variant in css/looks.css.
import { startScene, stopScene } from "./mcscene.js";

export const LOOKS = ["standard", "mc", "gallery", "prism", "studio"];
export const DEFAULT_LOOK = "standard";
/** Looks whose cards show a live CSS 3D figure instead of a flat render. */
export const LOOKS_3D = ["prism", "studio"];
/** Looks that animate cards in while scrolling. */
export const LOOKS_MOTION = ["prism", "studio"];
const KEY = "skin-library-look";

const FONTS = {
  standard: "family=Pixelify+Sans:wght@500;700&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@500",
  mc: "family=Pixelify+Sans:wght@400;500;700&family=Figtree:wght@400;500;600;700",
  gallery: "family=Instrument+Serif:ital@0;1&family=Hanken+Grotesk:wght@400;500;600",
  prism: "family=Unbounded:wght@400;600;800;900&family=Manrope:wght@400;500;600;700",
  studio: "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600",
};

export const currentLook = () => document.documentElement.dataset.look || DEFAULT_LOOK;

export function savedLook() {
  try { const l = localStorage.getItem(KEY); if (LOOKS.includes(l)) return l; } catch (e) { /* ignore */ }
  return DEFAULT_LOOK;
}

function ensureFont(look) {
  const id = "font-" + look;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id; link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?" + FONTS[look] + "&display=swap";
  document.head.appendChild(link);
}

export function applyLook(look) {
  if (!LOOKS.includes(look)) look = DEFAULT_LOOK;
  document.documentElement.dataset.look = look;
  ensureFont(look);
  if (look === "mc") startScene(); else stopScene();
  try { localStorage.setItem(KEY, look); } catch (e) { /* ignore */ }
}
