export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, content, apiKey } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: 'Claude API Key requerida. Agrégala en el sidebar bajo API Keys.' });
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const prompt = `Eres un analista estratégico de conocimiento especializado en IA y tecnología. Analiza el siguiente artículo y genera un análisis estructurado en español.

Título: ${title}
Contenido: ${content || '(sin contenido adicional)'}

Genera el análisis con EXACTAMENTE estas secciones (usa los encabezados ## tal como están):

## Idea Principal
[2-3 oraciones sobre el concepto central del artículo]

## Qué Problema Resuelve
[El pain point o necesidad que aborda este contenido]

## Frameworks y Metodologías
[Modelos mentales, frameworks o metodologías que presenta o implica]

## Insights Estratégicos
[3-4 insights no obvios o contraintuitivos del artículo]

## Herramientas Mencionadas
[Lista de herramientas, plataformas, modelos o tecnologías específicas mencionadas]

## Implicaciones para IA y Workflows
[Cómo esto afecta el trabajo con IA, automatización o sistemas de conocimiento]

## Mi Lectura Más Importante
[El takeaway más valioso y accionable de todo el artículo]

Sé específico, estratégico y evita generalidades. El análisis debe sentirse como el de un experto que ya leyó el artículo completo.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: `Anthropic API error ${r.status}: ${err.slice(0, 200)}` });
    }

    const data = await r.json();
    const analysis = data.content?.[0]?.text || '';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
