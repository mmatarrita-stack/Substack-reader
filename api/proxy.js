export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; SubstackReader/1.0)' };

  async function tryFetch(targetUrl) {
    // First: no-redirect probe to detect domain-level redirects
    const probe = await fetch(targetUrl, { redirect: 'manual', headers });
    if (probe.status >= 300 && probe.status < 400) {
      const location = probe.headers.get('location') || '';
      // If redirect strips our path, reconstruct the API path on the new domain
      const origPath = new URL(targetUrl).pathname + new URL(targetUrl).search;
      const newBase = new URL(location).origin;
      const reconstructed = newBase + origPath;
      return fetch(reconstructed, { headers });
    }
    // No redirect — follow normally
    return fetch(targetUrl, { headers });
  }

  try {
    const r = await tryFetch(url);
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: `Upstream ${r.status}`, detail: text.slice(0, 300) });
    }
    const data = await r.json();
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
