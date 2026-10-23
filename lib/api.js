// Requêtes vers les API web publiques de Roblox (faites ici et non dans la page, à cause du CORS).
const ALLOWED = [/\.roblox\.com$/, /\.rbxcdn\.com$/, /^ipinfo\.io$/];
const cache = new Map();

async function request({ url, method = 'GET', body, ttl = 0 }) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED.some((re) => re.test(u.hostname))) {
    throw new Error(`Hôte non autorisé : ${u.hostname}`);
  }
  const key = method + url + (body ? JSON.stringify(body) : '');
  const hit = cache.get(key);
  if (ttl && hit && Date.now() - hit.at < ttl) return hit.data;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      lastErr = new Error('Trop de requêtes, réessayez dans un instant.');
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} sur ${u.hostname}${u.pathname}`);
    const data = await res.json();
    if (ttl) cache.set(key, { at: Date.now(), data });
    return data;
  }
  throw lastErr;
}

module.exports = { request };
