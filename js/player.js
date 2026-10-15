// Look up the skin a Minecraft account wears right now, by player name. Mojang's own API does not
// allow requests from web pages, so public skin services that do are asked in turn.

const VALID = /^[A-Za-z0-9_]{3,16}$/;
export const isPlayerName = s => VALID.test(s);

async function getJson(url, signal) {
  const r = await fetch(url, { signal });
  if (r.status === 404 || r.status === 204) throw Object.assign(new Error("not found"), { notFound: true });
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}
async function getPng(url, signal) {
  const r = await fetch(url, { signal });
  if (r.status === 404) throw Object.assign(new Error("not found"), { notFound: true });
  if (!r.ok) throw new Error("http " + r.status);
  const b = await r.blob();
  if (!/image\/png/.test(b.type) && b.size < 100) throw new Error("no image");
  return new Blob([b], { type: "image/png" });
}

const SERVICES = [
  // Ashcon: name, UUID and the skin itself in one answer
  async (name, signal) => {
    const j = await getJson(`https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(name)}`, signal);
    const skin = j.textures && j.textures.skin;
    if (!skin) throw new Error("no skin");
    const blob = skin.data ? await (await fetch("data:image/png;base64," + skin.data)).blob() : await getPng(skin.url, signal);
    return { name: j.username || name, blob, slim: !!j.textures.slim };
  },
  // PlayerDB for the UUID, Crafatar for the skin
  async (name, signal) => {
    const j = await getJson(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`, signal);
    const p = j && j.data && j.data.player;
    if (!j.success || !p) throw Object.assign(new Error("not found"), { notFound: true });
    return { name: p.username || name, blob: await getPng(`https://crafatar.com/skins/${p.raw_id || p.id}`, signal) };
  },
  async (name, signal) => ({ name, blob: await getPng(`https://mc-heads.net/skin/${encodeURIComponent(name)}`, signal) }),
];

const cache = new Map();
/**
 * Resolve to { name, blob } for the account, or reject with .notFound when no such player exists.
 * Other errors mean no service could be reached.
 */
export function lookupPlayer(name, signal) {
  const key = name.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    let notFound = 0, last = null;
    for (const s of SERVICES) {
      try { return await s(name, signal); }
      catch (e) {
        if (signal && signal.aborted) throw e;
        if (e.notFound) notFound++;
        last = e;
      }
    }
    // only "not found" when a service answered that; else it is a connection problem
    throw Object.assign(new Error("lookup failed"), { notFound: notFound > 0, cause: last });
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}
