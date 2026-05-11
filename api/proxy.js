export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SubstackReader/1.0)' }
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Upstream error', status: response.status });
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
