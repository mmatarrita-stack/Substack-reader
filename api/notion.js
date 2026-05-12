// api/notion.js — Sincronización SubstackIntel ↔ Notion
// Solo artículos con estado "Guardado" se guardan en Notion.
// Archivar en Notion cuando pasan a Leido/Descartado.
// Database ID: d634f72e74fe82b48dea01baef2695ae

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DB_ID = 'd634f72e74fe82b48dea01baef2695ae';
  const NOTION_VER = '2022-06-28';

  const notionKey = req.method === 'GET'
    ? req.query.notionKey
    : (req.body || {}).notionKey;

  if (!notionKey) {
    return res.status(400).json({ error: 'Token de Notion requerido. Agrégalo en el sidebar bajo API Keys → NOTION.' });
  }

  const H = {
    'Authorization': `Bearer ${notionKey}`,
    'Notion-Version': NOTION_VER,
    'Content-Type': 'application/json',
  };

  // ── GET: traer todos los artículos guardados en Notion ──────────────────
  if (req.method === 'GET') {
    try {
      const rows = [];
      let cursor;
      do {
        const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
          method: 'POST', headers: H,
          body: JSON.stringify(cursor ? { start_cursor: cursor } : {}),
        });
        if (!r.ok) {
          const e = await r.text();
          return res.status(r.status).json({ error: `Notion ${r.status}: ${e.slice(0, 300)}` });
        }
        const d = await r.json();
        rows.push(...d.results);
        cursor = d.has_more ? d.next_cursor : null;
      } while (cursor);

      const anns = {};
      for (const row of rows) {
        const p = row.properties;
        const postId = p['Post ID']?.title?.[0]?.plain_text || '';
        if (!postId) continue;
        anns[postId] = {
          status: 'Guardado',
          rel:    p['Relevancia']?.select?.name   || '',
          cat:    p['Categoría']?.select?.name    || '',
          area:   p['Área']?.select?.name         || '',
          notes:  p['Notas']?.rich_text?.[0]?.plain_text || '',
          _notionPageId: row.id,
        };
      }
      return res.json({ anns });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      action, postId, title, newsletter, link, date,
      rel, cat, area, notes, summary, ideas, notionPageId,
    } = req.body || {};

    // REMOVE: archivar cuando pasa a Leido/Descartado
    if (action === 'remove') {
      if (!notionPageId) return res.json({ ok: true, skipped: true });
      try {
        const r = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
          method: 'PATCH', headers: H,
          body: JSON.stringify({ archived: true }),
        });
        if (!r.ok) {
          const e = await r.text();
          return res.status(r.status).json({ error: `Notion ${r.status}: ${e.slice(0, 300)}` });
        }
        return res.json({ ok: true, removed: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    // SAVE / UPDATE
    if (!postId) return res.status(400).json({ error: 'Missing postId' });

    const props = {
      'Post ID':       { title:      [{ text: { content: postId } }] },
      'Título':        { rich_text:  [{ text: { content: (title || '').slice(0, 2000) } }] },
      'Newsletter':    { rich_text:  [{ text: { content: (newsletter || '').slice(0, 500) } }] },
      'Link':          { url: link || null },
      'Fecha artículo':{ rich_text:  [{ text: { content: date || '' } }] },
      'Notas':         { rich_text:  [{ text: { content: (notes || '').slice(0, 2000) } }] },
    };
    if (rel)                        props['Relevancia'] = { select: { name: rel } };
    if (cat) props['Categoría'] = { select: { name: cat } };
    if (area)                       props['Área']      = { select: { name: area } };
    props['Estado'] = { select: { name: 'Guardado' } };

    // Contenido enriquecido de la página (solo al crear)
    const blocks = [];
    if (summary) {
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: summary.slice(0, 2000) } }] },
      });
    }
    if (ideas && ideas.length > 0) {
      blocks.push({
        object: 'block', type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: 'Ideas clave' } }] },
      });
      for (const idea of ideas.slice(0, 5)) {
        blocks.push({
          object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ type: 'text', text: { content: idea.slice(0, 2000) } }] },
        });
      }
    }
    if (notes) {
      blocks.push({
        object: 'block', type: 'callout',
        callout: {
          rich_text: [{ type: 'text', text: { content: notes.slice(0, 2000) } }],
          icon: { type: 'emoji', emoji: '📝' },
        },
      });
    }

    try {
      let r;
      if (notionPageId) {
        // Actualizar página existente (propiedades + desarchivar si estaba archivada)
        r = await fetch(`https://api.notion.com/v1/pages/${notionPageId}`, {
          method: 'PATCH', headers: H,
          body: JSON.stringify({ properties: props, archived: false }),
        });
      } else {
        // Crear nueva página con contenido
        const body = { parent: { database_id: DB_ID }, properties: props };
        if (blocks.length > 0) body.children = blocks;
        r = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST', headers: H,
          body: JSON.stringify(body),
        });
      }
      if (!r.ok) {
        const e = await r.text();
        return res.status(r.status).json({ error: `Notion ${r.status}: ${e.slice(0, 300)}` });
      }
      const data = await r.json();
      return res.json({ ok: true, notionPageId: data.id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
