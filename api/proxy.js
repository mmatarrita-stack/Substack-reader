export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; SubstackReader/1.0)' };

  async function tryFetch(targetUrl) {
    // First: no-redirect to detect domain-level redirects
    const probe = await fetch(targetUrl, { redirect: 'manual', headers });
    if (probe.status >= 300 && probe.status < 400) {
      const location = probe.headers.get('location') || '';
      // If redirect strips our path, reconstruct API path on new domain
      const origPath = new URL(targetUrl).pathname + new URL(targetUrl).search;
      const newBase = location.startsWith('http') ? new URL(location).origin : new URL(targetUrl).origin;
      const reconstructed = newBase + origPath;
      const r2 = await fetch(reconstructed, { redirect: 'follow', headers });
      return r2;
    }
    return probe;
  }

  try {
    const r = await tryFetch(url);
    if (!r.ok) return res.status(r.status).json({ error: 'Upstream error', status: r.status });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch(e) { return res.status(502).json({ error: 'Non-JSON response', preview: text.slice(0, 300) }); }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
