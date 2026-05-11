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
      const newB