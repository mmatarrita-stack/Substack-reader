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
    `${i + 1}. "${p.title}" — ${p.newsletter}`
  ).join('\n');

  const prompt = `Eres un editor experto en síntesis de conocimiento. El usuario recopiló ${posts.length} artículos sobre "${category}".

Tu misión: crear una GUÍA NARRATIVA en español — no una lista de viñetas, sino un documento con voz editorial, coherencia temática y flujo de lectura real.

Artículos disponibles (cítalos con [N] inline):
${postList}

REGLA DE CITAS: Inserta [N] inmediatamente después de la afirmación que respalda ese artículo. Puedes citar varios seguidos: [2][7]. Cita solo cuando el artículo respalda directamente lo dicho.

FORMATO OBLIGATORIO:
- Usa ## para cada título de sección
- Los títulos deben ser EVOCADORES y propios del tema (ej: "La Paradoja de la Visibilidad" — nunca "Patrón 1" ni "Principio Clave")
- Escribe en PROSA FLUIDA, sin viñetas ni listas numeradas dentro de las secciones
- Cada sección tiene 2-4 párrafos narrativos que conectan ideas de múltiples artículos
- Las secciones se conectan entre sí (referencia ideas anteriores cuando sea útil)

ESTRUCTURA (adapta los títulos al contenido real):

## Panorama General
[1-2 párrafos que establezcan el hilo conductor de esta colección de artículos. ¿Qué tensión o pregunta central recorre todos estos textos? Cita [N] los artículos más representativos.]

## [Título evocador del primer gran insight — ej: "La Paradoja de la Visibilidad"]
[2-3 párrafos que desarrollen este insight con profundidad. Conecta ideas de artículos distintos. Incluye citas [N].]

## [Título del segundo insight — ej: "Tu Voz Como Activo No Negociable"]
[ídem]

## [Título del tercer insight — si hay material suficiente]
[ídem]

## [Título del cuarto insight — solo si aplica]
[ídem]

## Cómo Aplicarlo
[2-3 párrafos narrativos con las implicaciones prácticas más importantes. Sin listas. Con citas [N]. ¿Qué debería hacer alguien que leyó esto?]

## Fuentes
[Lista TODOS los artículos citados anteriormente, uno por línea:
• [N] Título — Newsletter]

Sé concreto, evocador y específico para "${category}". El resultado debe sentirse como una pieza editorial de calidad, no como un resumen escolar.`;

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
