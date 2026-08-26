---
name: project-notes
description: Arquitectura, estado técnico y lecciones del proyecto SubstackIntel (verificado contra código fuente)
---

# SubstackIntel — qué es

App web React (single HTML file, sin build) desplegada en Vercel para leer, anotar y sincronizar newsletters de Substack con Notion. Clasificación automática por categoría, relevancia, notas, vistas Brief/Tarjetas/Tabla.

**URLs:**
- Producción: https://substack-reader-kappa.vercel.app
- GitHub: https://github.com/mmatarrita-stack/Substack-reader
- Deploy: Vercel, push a `main` para actualizar.

# Arquitectura (verificado en código, 2026-08-24)

Todo el estado vive en `localStorage` del navegador (fuentes, categorías, áreas, anotaciones, API keys). No hay backend con base de datos propia — Notion actúa como el único almacenamiento persistente cross-device.

**Frontend:** `index.html` — app React completa sin build step.

**Backend (Vercel serverless, 4 funciones):**

| Función | Rol |
|---|---|
| `api/proxy.js` | Proxy de feeds RSS de Substack. Hace un probe sin seguir redirects para detectar cambios de dominio y reconstruye la URL en el nuevo dominio antes de refetch. |
| `api/analyze.js` | Llama a Anthropic API (`claude-haiku-4-5-20251001`) con la Claude API Key que manda el cliente en el body. Genera análisis de 7 secciones fijas en español (Idea Principal, Qué Problema Resuelve, Frameworks, Insights, Herramientas, Implicaciones, Lectura Más Importante). |
| `api/guide.js` | Mismo modelo Claude. Genera una guía narrativa (no bullets) por categoría, con citas inline `[N]` a los artículos fuente. |
| `api/notion.js` | Sincronización con Notion (detalle abajo). |

**Claves de API:** tanto la Claude API Key como el token de Notion se ingresan en el sidebar de la app ("API Keys") y se guardan en `localStorage` del navegador (`sr-v1-notion-key` para Notion). No hay variables de entorno server-side para estas claves — viajan del cliente a la función serverless en cada request. Esto significa que las claves son por-navegador: no persisten si se limpia el storage o se cambia de dispositivo/navegador.

# Conexión con Notion — cómo funciona

1. En el sidebar, sección "NOTION": el usuario pega un token (`secret_...`) generado en `notion.so/my-integrations`.
2. El token se guarda en `localStorage` (`sr-v1-notion-key`) y se manda en cada llamada a `/api/notion`.
3. `api/notion.js` opera contra una sola Notion database (`DB_ID`) con 4 acciones:
   - **GET** (sin `action`): trae todas las páginas guardadas, arma el mapa de anotaciones por Post ID, y separa la página especial de config (`SR-CONFIG-V1`).
   - **POST save/update**: crea o actualiza una página por artículo guardado (properties + bloques de contenido: resumen, ideas clave, nota como callout).
   - **POST remove**: archiva la página en Notion cuando el artículo pasa a Leído/Descartado (no la borra).
   - **POST saveConfig**: guarda fuentes, categorías, áreas y blacklist en una página especial `SR-CONFIG-V1` (JSON en la propiedad Notas + bloques `BL:...` para blacklist larga).
   - **POST saveGuide**: guarda cada guía generada como página `GUIA-<categoría-slug>` con bloques de texto enriquecido (headings, bullets, párrafos).

**Schema de la Notion DB (propiedades usadas por el código):**
Post ID (title), Título (rich_text), Newsletter (rich_text), Link (url — `null` si no hay link válido, nunca `"#"`), Fecha artículo (rich_text), Notas (rich_text), Relevancia (select), Categoría (select), Área (select), Estado (select — valor usado: `"Guardado"`).

**✅ Resuelto (2026-08-26) — Database ID confirmado por Miguel.**

El workspace original "IA Notion" tiene un problema de conexión sin resolver (404 `object_not_found`, probado con múltiples integraciones). Se usa en su lugar una copia de la misma base en el workspace "Notion personal", conectada con el token de integración "Mesa curacion" (ya verificado con lecturas/escrituras reales en Mesa de Curación).

`DB_ID` actual (comentario de cabecera y constante en `api/notion.js`): `e114f72e74fe8212a7d101d3147e8d4b`.

IDs anteriores (ya no vigentes, solo referencia histórica): comentario de cabecera `d634f72e74fe82b48dea01baef2695ae`, constante anterior en código `b9801b4282cd82b1936b01bda7e41858`, URL guardada en memoria de proyecto anterior `07f4f72e74fe8328b5e30148a94e2cac`.

# Lecciones técnicas críticas

Siempre usar este patrón para escribir archivos en NTFS-mount desde Python (evita truncación):
```python
with open(path + ".tmp", "w", encoding="utf-8") as f:
    f.write(content)
    f.flush()
    os.fsync(f.fileno())
os.replace(path + ".tmp", path)
```
**Why:** El Edit tool y writes directos al mount de Windows/Linux truncan archivos grandes, causando Babel SyntaxErrors en producción.
**How to apply:** Cualquier vez que se modifique `index.html` o archivos grandes en este proyecto.

Otras lecciones:
- Unicode `✎` en texto JSX se renderiza literal — usar `{'✎'}` o el caracter directo.
- Regex con lookahead falla en Babel inline — usar split/startsWith.
- Notion API devuelve 400 si se envía una propiedad que no existe en el schema de la DB.
- `url: "#"` es inválido para una columna URL en Notion — enviar `null` en su lugar (ya implementado en `notion.js`).
- Git index.lock en Windows bloquea git desde Linux — usuario debe eliminar desde PowerShell.
- Notion integrations son workspace-scoped — no se puede acceder cross-workspace.

---

*Migrado y verificado contra el código fuente (`index.html`, `api/*.js`) el 2026-08-24, al formalizar SubstackIntel como proyecto independiente de Cowork. Reemplaza la versión anterior basada solo en memoria.*
