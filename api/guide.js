export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { apiKey, category, posts } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: 'Claude API Key requerida. Agrégala en el sidebar bajo API Keys.' });
  if (!category || !posts?.length) return res.status(400).json({ error: 'Categoría y artículos requeridos.' });

  const postList = posts.map((p, i) =>
    `${i + 1}. "${p.title}" — ${p.newsletter}\n   ${p.link}`
  ).join('\n\n');

  const prompt = `Eres un experto en síntesis de conocimiento. El usuario recopiló ${posts.length} artículos sobre "${category}".

Basándote ÚNICAMENTE en los títulos de estos artículos, crea una guía de referencia en español con citas inline.

Artículos recopilados (usa el número como cita):
${postList}

REGLA DE CITAS: Después de cada afirmación importante en Patrones, Principios y Cómo Aplicarlo, añade [N] donde N es el número del artículo que respalda esa idea. Puedes citar varios: [2][5]. Solo cita cuando el artículo específico respalda directamente la afirmación.

Genera la guía con EXACTAMENTE estas secciones usando ## como encabezados:

## Tema Central
[2-3 oraciones sobre el hilo conductor. Incluye citas [N] a los artículos más representativos.]

## Patrones Identificados
[3-5 patrones recurrentes. Cada patrón debe terminar con su cita [N].]

## Principios Clave
[4-6 principios accionables. Cada principio debe terminar con su cita [N].]

## Cómo Aplicarlo
[3-4 aplicaciones concretas. Cada una con cita [N] al artículo de origen.]

## Fuentes Recomendadas
[Lista TODOS los artículos que hayas citado con [N] en las secciones anteriores. Formato:
• [N] Título — Newsletter
  🔗 link
Si citaste todos los artículos de la lista, inclúyelos todos aquí.]

Sé concreto y específico para "${category}". Evita frases genéricas.`;

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
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: `Claude API error ${r.status}: ${err.slice(0, 200)}` });
    }

    const data = await r.json();
    const guide = data.content?.[0]?.text || '';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ guide });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
