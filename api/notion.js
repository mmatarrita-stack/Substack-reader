// api/notion.js — Sincronización SubstackIntel ↔ Notion
// Solo artículos con estado "Guardado" se guardan en Notion.
// Archivar en Notion cuando pasan a Leido/Descartado.
// Database ID: d634f72e74fe82b48dea01baef2695ae

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DB_ID = 'b9801b4282cd82b1936b01bda7e41858';
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
      let notionConfig = null, configPageId = null;
      for (const row of rows) {
        const p = row.properties;
        const postId = p['Post ID']?.title?.[0]?.plain_text || '';
        if (!postId) continue;
        if (postId === 'SR-CONFIG-V1') {
          configPageId = row.id;
          try { notionConfig = JSON.parse(p['Notas']?.rich_text?.[0]?.plain_text || 'null'); } catch(e) {}
          continue;
        }
        if (postId.startsWith('GUIA-')) continue; // paginas de guia generadas, no son articulos
        anns[postId] = {
          status: 'Guardado',
          rel:    p['Relevancia']?.select?.name   || '',
          cat:    p['Categoría']?.select?.name    || '',
          area:   p['Área']?.select?.name         || '',
          notes:  p['Notas']?.rich_text?.[0]?.plain_text || '',
          title:      p['Título']?.rich_text?.[0]?.plain_text || '',
          newsletter: p['Newsletter']?.rich_text?.[0]?.plain_text || '',
          link:       p['Link']?.url || '',
          date:       p['Fecha artículo']?.rich_text?.[0]?.plain_text || '',
          _notionPageId: row.id,
        };
      }
      // Fetch blacklist blocks from config page
      if (configPageId && notionConfig) {
        try {
          const br = await fetch(`https://api.notion.com/v1/blocks/${configPageId}/children`, { method: 'GET', headers: H });
          if (br.ok) {
            const bd = await br.json();
            const bl = [];
            for (const b of bd.results) {
              const t = b.paragraph?.rich_text?.[0]?.plain_text || '';
              if (t.startsWith('BL:')) { try { bl.push(...JSON.parse(t.slice(3))); } catch(e) {} }
            }
            if (bl.length) notionConfig.blacklist = bl;
          }
        } catch(e) {}
      }
      return res.json({ anns, notionConfig, configPageId });
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

    // SAVE CONFIG
    if (action === 'saveConfig') {
      const { config = {}, configPageId } = req.body || {};
      const { sources = [], cats = [], areas = [], blacklist = [] } = config;
      const mainJson = JSON.stringify({ sources, cats, areas });
      const cfgProps = {
        'Post ID': { title: [{ text: { content: 'SR-CONFIG-V1' } }] },
        'Título':  { rich_text: [{ text: { content: '⚙️ SubstackIntel Config' } }] },
        'Notas':   { rich_text: [{ text: { content: mainJson.slice(0, 1900) } }] },
        'Estado':  { select: { name: 'Guardado' } },
      };
      const blBlocks = [];
      for (let i = 0; i < blacklist.length; i += 20) {
        blBlocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'BL:' + JSON.stringify(blacklist.slice(i, i + 20)) } }] } });
      }
      try {
        let pid = configPageId;
        if (pid) {
          const pr = await fetch(`https://api.notion.com/v1/pages/${pid}`, { method: 'PATCH', headers: H, body: JSON.stringify({ properties: cfgProps, archived: false }) });
          if (!pr.ok) { const e = await pr.text(); return res.status(pr.status).json({ error: `Notion ${pr.status}: ${e.slice(0, 300)}` }); }
          // Refresh blocks: delete existing, append new
          const br = await fetch(`https://api.notion.com/v1/blocks/${pid}/children`, { method: 'GET', headers: H });
          if (br.ok) {
            const bd = await br.json();
            await Promise.all(bd.results.map(b => fetch(`https://api.notion.com/v1/blocks/${b.id}`, { method: 'DELETE', headers: H })));
          }
          if (blBlocks.length > 0) await fetch(`https://api.notion.com/v1/blocks/${pid}/children`, { method: 'PATCH', headers: H, body: JSON.stringify({ children: blBlocks }) });
        } else {
          const body = { parent: { database_id: DB_ID }, properties: cfgProps };
          if (blBlocks.length > 0) body.children = blBlocks;
          const cr = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: H, body: JSON.stringify(body) });
          if (!cr.ok) { const e = await cr.text(); return res.status(cr.status).json({ error: `Notion ${cr.status}: ${e.slice(0, 300)}` }); }
          pid = (await cr.json()).id;
        }
        return res.json({ ok: true, configPageId: pid });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // SAVE GUIDE
    if (action === 'saveGuide') {
      const { category, guideText, count, guideNotionPageId } = req.body || {};
      if (!category || !guideText) return res.status(400).json({ error: 'Missing category or guideText' });
      const slug = (category || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const guideProps = {
        'Post ID':    { title:     [{ text: { content: 'GUIA-' + slug } }] },
        'Título':     { rich_text: [{ text: { content: ('📖 Guía: ' + category).slice(0, 2000) } }] },
        'Notas':      { rich_text: [{ text: { content: (count + ' artículos · Generada automáticamente').slice(0, 2000) } }] },
        'Estado':     { select: { name: 'Guardado' } },
      };
      if (category && category !== 'Sin categoria') guideProps['Categoría'] = { select: { name: category } };
      const blocks = [];
      for (const line of guideText.split('\n')) {
        if (line.startsWith('## ')) {
          blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: line.slice(3).trim() } }] } });
        } else if (line.startsWith('• ') || line.startsWith('- ')) {
          blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: line.replace(/^[•\-]\s*/,'').trim().slice(0, 2000) } }] } });
        } else if (line.trim()) {
          blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: line.trim().slice(0, 2000) } }] } });
        }
      }
      try {
        let r;
        if (guideNotionPageId) {
          r = await fetch(`https://api.notion.com/v1/pages/${guideNotionPageId}`, {
            method: 'PATCH', headers: H,
            body: JSON.stringify({ properties: guideProps, archived: false }),
          });
        } else {
          const body = { parent: { database_id: DB_ID }, properties: guideProps };
          if (blocks.length > 0) body.children = blocks.slice(0, 100);
          r = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: H, body: JSON.stringify(body) });
        }
        if (!r.ok) { const e = await r.text(); return res.status(r.status).json({ error: `Notion ${r.status}: ${e.slice(0, 300)}` }); }
        const data = await r.json();
        return res.json({ ok: true, guideNotionPageId: data.id });
      } catch (e) { return res.status(500).json({ error: e.message }); }
    }

    // SAVE / UPDATE
    if (!postId) return res.status(400).json({ error: 'Missing postId' });

    const props = {
      'Post ID':       { title:      [{ text: { content: postId } }] },
      'Título':        { rich_text:  [{ text: { content: (title || '').slice(0, 2000) } }] },
      'Newsletter':    { rich_text:  [{ text: { content: (newsletter || '').slice(0, 500) } }] },
      'Link':          { url: (link && link !== '#') ? link : null },
      'Fecha artículo':{ rich_text:  [{ text: { content: date || '' } }] },
      'Notas':         { rich_text:  [{ text: { content: (notes || '').slice(0, 2000) } }] },
    };
    if (rel)                        props['Relevancia'] = { select: { name: rel } };
    if (cat && cat !== 'Sin categoria') props['Categoría'] = { select: { name: cat } };
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
