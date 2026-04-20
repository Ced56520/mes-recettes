function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function textResponse(text, status = 200, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function badRequest(message) {
  return json({ error: message }, 400);
}

function decodeUnicodeEscapes(text) {
  return String(text || '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      try { return String.fromCharCode(parseInt(hex, 16)); } catch { return _; }
    })
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\');
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#(x?[0-9a-fA-F]+);/g, (_, code) => {
      try {
        const num = String(code).toLowerCase().startsWith('x')
          ? parseInt(String(code).slice(1), 16)
          : parseInt(String(code), 10);
        return Number.isFinite(num) ? String.fromCodePoint(num) : _;
      } catch {
        return _;
      }
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&eacute;/gi, 'é')
    .replace(/&egrave;/gi, 'è')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&agrave;/gi, 'à')
    .replace(/&ccedil;/gi, 'ç');
}

function stripTagsPreserveLines(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/section|\/article|\/li|\/h\d|\/ul|\/ol)>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/?div[^>]*>/gi, '\n')
    .replace(/<\/?section[^>]*>/gi, '\n')
    .replace(/<\/?article[^>]*>/gi, '\n')
    .replace(/<\/?li[^>]*>/gi, '\n')
    .replace(/<\/?h[1-6][^>]*>/gi, '\n')
    .replace(/<\/?ul[^>]*>/gi, '\n')
    .replace(/<\/?ol[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
}

function cleanText(value) {
  return decodeHtmlEntities(stripTagsPreserveLines(value))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cleanInline(value) {
  return decodeUnicodeEscapes(decodeHtmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIngredient(value) {
  return cleanInline(value)
    .replace(/œufs/gi, 'oeufs')
    .replace(/œuf/gi, 'oeuf')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularizeWord(word) {
  let w = String(word || '').toLowerCase();
  if (w.endsWith('ees')) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -1);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

function ingredientFingerprint(value) {
  const normalized = normalizeIngredient(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/de|du|des|en|et/g, ' ')
    .replace(/(r[ae]pee?|liquide|briquette|petit|petite|grand|grande|gros|grosse|rincee|rapee)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = normalized.split(' ').filter(Boolean);
  const qty = [];
  const words = [];
  for (const part of parts) {
    if (/^\d+(?:[.,/]\d+)?$/.test(part) || /^(g|kg|ml|cl|l)$/.test(part)) qty.push(part.replace(',', '.'));
    else words.push(singularizeWord(part));
  }
  return [...qty, ...words].join(' ');
}

function chooseBetterIngredient(prev, next) {
  const a = normalizeIngredient(prev);
  const b = normalizeIngredient(next);
  const score = (v) => {
    let s = v.length;
    if (/de/i.test(v)) s += 4;
    if (/au sirop|rap[ée]e?|liquide|briquette/i.test(v)) s += 6;
    if (/oeufs/i.test(v)) s += 1;
    return s;
  };
  return score(b) >= score(a) ? b : a;
}

function uniqueIngredients(items) {
  const out = [];
  const index = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const cleaned = normalizeIngredient(item);
    if (!cleaned) continue;
    const key = ingredientFingerprint(cleaned) || cleaned.toLowerCase();
    if (!index.has(key)) {
      index.set(key, out.length);
      out.push(cleaned);
    } else {
      const i = index.get(key);
      out[i] = chooseBetterIngredient(out[i], cleaned);
    }
  }
  return out;
}

function safeParseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return uniqueIngredients(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function safeParseSnapshot(value) {
  try {
    const parsed = JSON.parse(value || 'null');
    return normalizeSnapshot(parsed);
  } catch {
    return null;
  }
}

function normalizeInstructions(value) {
  const output = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'string') {
      const text = cleanInline(node);
      if (text) output.push(text);
      return;
    }
    if (typeof node === 'object') {
      if (node.text) visit(node.text);
      if (node.name && !node.text) visit(node.name);
      if (node.itemListElement) visit(node.itemListElement);
      if (node.item) visit(node.item);
    }
  };
  visit(value);
  return uniqueParagraphs(output);
}

function uniqueParagraphs(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const cleaned = cleanInline(item);
    const key = cleaned.toLowerCase();
    if (cleaned && !seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const normalized = {
    sourceUrl: String(snapshot.sourceUrl || snapshot.url || '').trim(),
    title: cleanInline(snapshot.title || ''),
    description: cleanInline(snapshot.description || ''),
    ingredients: uniqueIngredients(Array.isArray(snapshot.ingredients) ? snapshot.ingredients : []),
    instructions: normalizeInstructions(snapshot.instructions || snapshot.steps || []),
    totalTime: cleanInline(snapshot.totalTime || ''),
    recipeYield: cleanInline(snapshot.recipeYield || ''),
    image: String(snapshot.image || '').trim(),
    savedAt: String(snapshot.savedAt || snapshot.importedAt || new Date().toISOString())
  };
  const hasContent = normalized.title || normalized.description || normalized.ingredients.length || normalized.instructions.length;
  return hasContent ? normalized : null;
}

function rowToRecipe(row) {
  return {
    id: row.id,
    title: cleanInline(row.title),
    url: row.url || '',
    category: cleanInline(row.category || 'Autre') || 'Autre',
    image: row.image || '',
    ingredients: safeParseArray(row.ingredients_json),
    notes: cleanInline(row.notes || ''),
    favorite: Boolean(row.favorite),
    snapshot: safeParseSnapshot(row.snapshot_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recipeToDb(recipe) {
  return {
    ...recipe,
    ingredients_json: JSON.stringify(uniqueIngredients(recipe.ingredients || [])),
    snapshot_json: recipe.snapshot ? JSON.stringify(normalizeSnapshot(recipe.snapshot)) : null,
    favorite: recipe.favorite ? 1 : 0,
  };
}

function escapeCsvCell(value) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

function buildCsv(recipes) {
  const headers = [
    'title', 'url', 'category', 'ingredients', 'notes', 'image', 'favorite', 'createdAt', 'updatedAt',
    'snapshotSaved', 'snapshotTitle', 'snapshotDescription', 'snapshotIngredients', 'snapshotInstructions',
    'snapshotTotalTime', 'snapshotYield', 'snapshotSavedAt'
  ];
  const rows = recipes.map(recipe => {
    const snapshot = recipe.snapshot || {};
    return [
      recipe.title,
      recipe.url,
      recipe.category,
      (recipe.ingredients || []).join(' | '),
      recipe.notes,
      recipe.image,
      recipe.favorite ? 'oui' : 'non',
      recipe.createdAt,
      recipe.updatedAt,
      recipe.snapshot ? 'oui' : 'non',
      snapshot.title || '',
      snapshot.description || '',
      (snapshot.ingredients || []).join(' | '),
      (snapshot.instructions || []).join(' | '),
      snapshot.totalTime || '',
      snapshot.recipeYield || '',
      snapshot.savedAt || ''
    ].map(escapeCsvCell).join(',');
  });
  return [headers.join(','), ...rows].join('\n');
}

function smartTitleFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/[-_]+/g, ' ')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
    if (slug) return slug.replace(/\b\w/g, c => c.toUpperCase());
    return `Recette ${u.hostname.replace(/^www\./, '')}`;
  } catch {
    return 'Recette sans titre';
  }
}

async function listRecipes(env) {
  const { results = [] } = await env.DB.prepare('SELECT * FROM recipes ORDER BY updated_at DESC').all();
  return results.map(rowToRecipe);
}

async function getRecipe(env, id) {
  const row = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first();
  return row ? rowToRecipe(row) : null;
}

async function createRecipe(env, payload) {
  const now = new Date().toISOString();
  const recipe = {
    id: crypto.randomUUID(),
    title: cleanInline(payload.title || payload.url || '') || smartTitleFromUrl(payload.url || ''),
    url: String(payload.url || '').trim(),
    category: cleanInline(payload.category || 'Autre') || 'Autre',
    image: String(payload.image || '').trim(),
    ingredients: uniqueIngredients(payload.ingredients || []),
    notes: cleanInline(payload.notes || ''),
    favorite: Boolean(payload.favorite),
    snapshot: normalizeSnapshot(payload.snapshot),
    createdAt: now,
    updatedAt: now,
  };
  if (!recipe.title) throw new Error('Ajoute au moins un titre ou un lien.');
  const db = recipeToDb(recipe);
  await env.DB.prepare(`
    INSERT INTO recipes (id, title, url, category, image, ingredients_json, notes, favorite, snapshot_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    db.id, db.title, db.url, db.category, db.image, db.ingredients_json, db.notes, db.favorite, db.snapshot_json, db.createdAt, db.updatedAt
  ).run();
  return recipe;
}

async function updateRecipe(env, id, payload) {
  const existing = await getRecipe(env, id);
  if (!existing) return null;
  const nextUrl = payload.url !== undefined ? String(payload.url || '').trim() : existing.url;
  const merged = {
    ...existing,
    title: payload.title !== undefined ? cleanInline(payload.title || '') || smartTitleFromUrl(nextUrl || existing.url || '') : existing.title,
    url: nextUrl,
    category: payload.category !== undefined ? cleanInline(payload.category || 'Autre') || 'Autre' : existing.category,
    image: payload.image !== undefined ? String(payload.image || '').trim() : existing.image,
    ingredients: payload.ingredients !== undefined ? uniqueIngredients(payload.ingredients || []) : existing.ingredients,
    notes: payload.notes !== undefined ? cleanInline(payload.notes || '') : existing.notes,
    favorite: payload.favorite !== undefined ? Boolean(payload.favorite) : existing.favorite,
    snapshot: payload.snapshot !== undefined ? normalizeSnapshot(payload.snapshot) : existing.snapshot,
    updatedAt: new Date().toISOString(),
  };
  const db = recipeToDb(merged);
  await env.DB.prepare(`
    UPDATE recipes
    SET title = ?, url = ?, category = ?, image = ?, ingredients_json = ?, notes = ?, favorite = ?, snapshot_json = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    db.title, db.url, db.category, db.image, db.ingredients_json, db.notes, db.favorite, db.snapshot_json, db.updatedAt, id
  ).run();
  return merged;
}

async function deleteRecipe(env, id) {
  await env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id).run();
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const raw = match[1]?.trim();
    if (raw) blocks.push(raw);
  }
  return blocks;
}

function findRecipeObject(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (node['@type']) {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some(type => String(type).toLowerCase() === 'recipe')) return node;
  }
  if (node['@graph']) {
    const found = findRecipeObject(node['@graph']);
    if (found) return found;
  }
  for (const value of Object.values(node)) {
    const found = findRecipeObject(value);
    if (found) return found;
  }
  return null;
}

function parseJsonLdRecipe(html) {
  const blocks = extractJsonLdBlocks(html);
  for (const raw of blocks) {
    try {
      const parsed = JSON.parse(raw.replace(/^\uFEFF/, '').trim());
      const recipe = findRecipeObject(parsed);
      if (recipe) return recipe;
    } catch {
    }
  }
  return null;
}

function firstImage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImage(item);
      if (found) return found;
    }
  }
  if (typeof value === 'object') {
    return value.url || value.contentUrl || '';
  }
  return '';
}

function extractMeta(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return '';
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1] ? cleanInline(match[1]) : '';
}

function absolutizeUrl(candidate, baseUrl) {
  if (!candidate) return '';
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return '';
  }
}

function scoreImage(url) {
  const value = String(url || '').toLowerCase();
  if (!value) return -999;
  let score = 0;
  if (/\.(jpg|jpeg|png|webp)(\?|$)/.test(value)) score += 8;
  if (/recipe|recette|plat|dish|food|cuisine|tarte|quiche|gateau|dessert/.test(value)) score += 8;
  if (/logo|sprite|icon|favicon|avatar|placeholder|moulinex|magazine/.test(value)) score -= 25;
  if (/twitter\.png|apple-touch-icon/.test(value)) score -= 15;
  score += Math.min(value.length / 30, 8);
  return score;
}

function chooseBestImage(candidates, baseUrl) {
  const unique = [...new Set((candidates || []).map(v => absolutizeUrl(v, baseUrl)).filter(Boolean))];
  if (!unique.length) return '';
  unique.sort((a, b) => scoreImage(b) - scoreImage(a));
  return unique[0] || '';
}

function extractImageCandidatesFromHtml(html) {
  const candidates = [];
  for (const key of ['og:image', 'twitter:image', 'twitter:image:src']) {
    const meta = extractMeta(html, key);
    if (meta) candidates.push(meta);
  }
  const imgRe = /<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRe.exec(html))) {
    const tag = match[0] || '';
    const src = match[1] || '';
    const hint = tag.toLowerCase();
    if (/logo|icon|avatar|sprite|favicon|moulinex|kiosque/.test(hint) || /logo|icon|avatar|sprite|favicon|moulinex|kiosque/.test(src.toLowerCase())) continue;
    candidates.push(src);
  }
  return candidates;
}

function htmlFragmentToLines(fragment) {
  return cleanText(fragment)
    .split('\n')
    .map(v => cleanInline(v))
    .filter(Boolean);
}

function extractHeadingBlock(html, startLabel, endLabel) {
  const re = new RegExp(`${startLabel}([\\s\\S]*?)${endLabel}`, 'i');
  const match = html.match(re);
  return match ? match[1] : '';
}

function extractVisibleSectionLines(html, startLabel, endLabel) {
  const lines = cleanText(html)
    .split('\n')
    .map(v => cleanInline(v))
    .filter(Boolean);

  const startRe = new RegExp(`^${startLabel}$`, 'i');
  const endRe = new RegExp(`^${endLabel}$`, 'i');
  const startIndex = lines.findIndex(line => startRe.test(line));
  if (startIndex === -1) return [];

  let endIndex = lines.findIndex((line, idx) => idx > startIndex && endRe.test(line));
  if (endIndex === -1) endIndex = lines.length;
  return lines.slice(startIndex + 1, endIndex);
}

function looksBadIngredientLine(line) {
  const low = line.toLowerCase();
  return !line ||
    /^image:?/i.test(line) ||
    /^(voir plus|voir moins)$/i.test(line) ||
    /^version veggie$/i.test(line) ||
    /^acheter$/i.test(line) ||
    /^~+$/.test(line) ||
    /^amazon/i.test(line) ||
    /^en cliquant/i.test(line) ||
    /^les meilleures|^top des|^plus de détails/i.test(line) ||
    /^["']?>?$/.test(line) ||
    /aria-label|counter|svg|button|input|min=|max=/.test(low);
}

function isLikelyIngredientLine(line) {
  const low = line.toLowerCase();
  if (looksBadIngredientLine(line)) return false;
  if (/^\d+(\s?(g|kg|ml|cl|l))?\s+de\s+/.test(low)) return true;
  if (/^\d+\s+rouleau/.test(low)) return true;
  if (/^\d+\s+oeufs?$/.test(low)) return true;
  if (/^\d+\s+/.test(low)) return true;
  if (/cr[eè]me|muscade|poivre|sel|p[aâ]te|lardons?|oeufs?/.test(low)) return true;
  return line.split(' ').length <= 5;
}

function cleanIngredientLine(line) {
  return cleanInline(line)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .trim();
}

function mergeIngredientTokens(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    let line = cleanIngredientLine(lines[i]);
    const next = lines[i + 1] ? cleanIngredientLine(lines[i + 1]) : '';
    const next2 = lines[i + 2] ? cleanIngredientLine(lines[i + 2]) : '';

    if (/^\d+$/.test(line) && /^(g|kg|ml|cl|l)$/i.test(next) && /^de$/i.test(next2)) {
      const rest = [];
      let j = i + 3;
      while (j < lines.length && !/^\d+$/.test(lines[j]) && !/^(voir plus|voir moins|ustensiles)$/i.test(lines[j])) {
        if (looksBadIngredientLine(lines[j])) { j += 1; continue; }
        if (j > i + 3 && /^(muscade|poivre|sel|lardons?|oeufs?|p[aâ]te|cr[eè]me)/i.test(lines[j])) break;
        rest.push(cleanIngredientLine(lines[j]));
        j += 1;
        if (rest.length >= 2) break;
      }
      out.push(`${line} ${next} de ${rest.join(' ')}`.trim());
      i = Math.max(j, i + 4);
      continue;
    }

    if (/^\d+$/.test(line) && /^(oeufs?)$/i.test(next)) {
      out.push(`${line} ${next}`.trim());
      i += 2;
      continue;
    }

    if (/^\d+$/.test(line) && /^rouleau$/i.test(next) && /^de$/i.test(next2)) {
      const rest = [];
      let j = i + 3;
      while (j < lines.length && !looksBadIngredientLine(lines[j])) {
        rest.push(cleanIngredientLine(lines[j]));
        j += 1;
        if (rest.length >= 2) break;
      }
      out.push(`${line} rouleau de ${rest.join(' ')}`.trim());
      i = Math.max(j, i + 4);
      continue;
    }

    out.push(line);
    i += 1;
  }
  return uniqueIngredients(out);
}

function formatStructuredIngredient(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const name = cleanInline(obj.name || obj.ingredient || obj.label || '');
  const qty = cleanInline(String(obj.qty ?? obj.quantity ?? obj.amount ?? ''));
  const unit = cleanInline(obj.unit || obj.unitText || '');
  return cleanInline([qty, unit, name].filter(Boolean).join(' '));
}

function extractMarmitonIngredientsFromScripts(html) {
  const arrayMatch = html.match(/"recipeIngredient"\s*:\s*\[([\s\S]*?)\]/i);
  if (arrayMatch) {
    const results = [];
    const strRe = /"((?:\.|[^"])*)"/g;
    let s;
    while ((s = strRe.exec(arrayMatch[1]))) {
      const value = decodeUnicodeEscapes(decodeHtmlEntities(s[1].replace(/\"/g, '"')));
      const cleaned = cleanInline(value);
      if (cleaned) results.push(cleaned);
    }
    const unique = uniqueIngredients(results).filter(v =>
      v && !/^(Je cherche|Se connecter|Mes recettes|Paramètres de compte|Voir plus|Voir moins)$/i.test(v)
    );
    if (unique.length) return unique;
  }

  const results = [];
  const objectRe = /\{"name":"([^"]+)","qty":([^,}\]]+),"unit":"([^"]*)"\}/gi;
  let m;
  while ((m = objectRe.exec(html))) {
    const name = decodeUnicodeEscapes(decodeHtmlEntities(m[1] || ''));
    const qtyRaw = decodeUnicodeEscapes((m[2] || '').replace(/^"|"$/g, '').trim());
    const unit = decodeUnicodeEscapes(decodeHtmlEntities(m[3] || ''));
    const line = cleanInline([qtyRaw, unit, name].filter(Boolean).join(' '));
    if (line) results.push(line);
  }

  return uniqueIngredients(results).filter(v =>
    v &&
    !/^(Je cherche|Se connecter|Mes recettes|Paramètres de compte|Voir plus|Voir moins)$/i.test(v)
  );
}

function extractMarmitonIngredients(html) {
  const lines = extractVisibleSectionLines(html, 'Ingr[ée]dients', 'Ustensiles');
  const raw = [];
  for (const item of lines) {
    const line = cleanIngredientLine(item);
    if (!line) continue;
    if (looksBadIngredientLine(line)) continue;
    if (/^(voir plus|voir moins|version veggie)$/i.test(line)) continue;
    if (/^(Je cherche|Se connecter|Mes recettes|Paramètres de compte)$/i.test(line)) continue;
    raw.push(line);
  }

  const merged = mergeIngredientTokens(raw)
    .filter(isLikelyIngredientLine)
    .filter(line => !/^(ustensiles|préparation)$/i.test(line))
    .filter(line => !/^(Je cherche|Se connecter|Mes recettes|Paramètres de compte)$/i.test(line));

  const visible = uniqueIngredients(merged).slice(0, 80);
  if (visible.length >= 3) return visible;

  const scripted = extractMarmitonIngredientsFromScripts(html);
  if (scripted.length >= 3) return scripted.slice(0, 80);

  return visible;
}

function extractMarmitonInstructions(html) {
  const lines = extractVisibleSectionLines(html, 'Pr[ée]paration', 'Vous aimerez aussi|Commentaires|Plus de recettes|Ces contenus devraient vous intéresser');
  const steps = [];
  let current = '';

  for (const raw of lines) {
    const line = cleanInline(raw);
    if (!line) continue;
    if (/^A Anonyme$/i.test(line) || /^Qu'est-ce qu'on mange ce soir/i.test(line)) break;
    if (/^Je m'inscris/i.test(line) || /^\*En cliquant/i.test(line)) break;
    if (/^Note de l'auteur/i.test(line) || /^Publicité$/i.test(line)) break;
    if (/^[A-Z] [A-Za-zÀ-ÿ]/.test(line) && current) break;
    if (/^Étape\s+\d+$/i.test(line)) {
      if (current) steps.push(current);
      current = '';
      continue;
    }
    if (/^(Temps total|Pr[ée]paration|Repos|Cuisson)\s*:?$/i.test(line)) continue;
    if (/^\d+\s*min$/i.test(line) || /^-$/.test(line)) continue;
    if (current) current += ' ' + line;
    else current = line;
  }

  if (current) steps.push(current);
  return uniqueParagraphs(steps);
}

function normalizeJsonLdRecipe(recipeObj) {
  if (!recipeObj || typeof recipeObj !== 'object') return {};
  const title = cleanInline(recipeObj.name || '');
  const description = cleanInline(recipeObj.description || '');
  const ingredients = uniqueIngredients(Array.isArray(recipeObj.recipeIngredient) ? recipeObj.recipeIngredient : []);
  const instructions = normalizeInstructions(recipeObj.recipeInstructions || []);
  const totalTime = cleanInline(recipeObj.totalTime || recipeObj.cookTime || recipeObj.prepTime || '');
  const recipeYield = Array.isArray(recipeObj.recipeYield)
    ? cleanInline(recipeObj.recipeYield.join(', '))
    : cleanInline(recipeObj.recipeYield || '');
  const image = firstImage(recipeObj.image);
  return { title, description, ingredients, instructions, totalTime, recipeYield, image };
}

function genericIngredientFallback(html) {
  const block = extractHeadingBlock(html, 'Ingr[ée]dients', 'Ustensiles|Pr[ée]paration|Étapes');
  const lines = htmlFragmentToLines(block)
    .filter(line => !looksBadIngredientLine(line));
  return uniqueIngredients(lines.filter(line => line.split(' ').length <= 12));
}

function genericInstructionFallback(html) {
  const block = extractHeadingBlock(html, 'Pr[ée]paration|Étapes', 'Vous aimerez aussi|Commentaires|Plus de recettes|Ces contenus devraient vous intéresser');
  const lines = htmlFragmentToLines(block);
  const steps = [];
  let current = '';
  for (const line of lines) {
    if (/^Étape\s+\d+$/i.test(line)) {
      if (current) steps.push(current);
      current = '';
      continue;
    }
    if (/^A Anonyme$/i.test(line) || /^Qu'est-ce qu'on mange/i.test(line)) break;
    if (/^(Temps total|Pr[ée]paration|Repos|Cuisson)\s*:?\s*$/i.test(line)) continue;
    if (/^\d+\s*min$/i.test(line) || /^-$/.test(line)) continue;
    if (!line) continue;
    if (current) current += ' ' + line;
    else current = line;
  }
  if (current) steps.push(current);
  return uniqueParagraphs(steps);
}

function chooseCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (/dessert|gâteau|gateau|tarte|mousse|cookie|biscuit|brownie|glace/.test(text)) return 'Dessert';
  if (/ap[ée]ro|toast|rillettes|verrine/.test(text)) return 'Apéritif';
  if (/boisson|cocktail|jus|smoothie/.test(text)) return 'Boisson';
  if (/sauce|bechamel|béchamel|poivre|vinaigrette|pesto|coulis|mayonnaise|aioli|a[iï]oli/.test(text)) return 'Sauce';
  if (/brunch|petit d[eé]j|petit[- ]d[eé]jeuner/.test(text)) return 'Petit-déjeuner';
  if (/entr[ée]e|salade|velout[ée]|soupe|quiche/.test(text)) return 'Entrée';
  return 'Plat';
}


function extractSectionBlocksFromText(text, headings) {
  const lines = String(text || '').split(/\r?\n/).map(v => cleanInline(v));
  const normalizedHeadings = headings.map(h => new RegExp(`^#{1,6}\\s*${h}\\s*$`, 'i'));
  const genericHeading = /^#{1,6}\s+/;
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!normalizedHeadings.some(re => re.test(lines[i]))) continue;
    const chunk = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (genericHeading.test(line)) break;
      chunk.push(line);
    }
    out.push(chunk.filter(Boolean));
  }
  return out;
}

function parseRecipeFromReadableText(sourceUrl, text) {
  const lines = String(text || '').split(/\r?\n/).map(v => cleanInline(v)).filter(Boolean);
  let title = '';
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      title = cleanInline(line.replace(/^#\s+/, ''));
      break;
    }
  }
  if (!title) title = smartTitleFromUrl(sourceUrl);

  const ingredientsSections = extractSectionBlocksFromText(text, ['Ingr[ée]dients']);
  const prepSections = extractSectionBlocksFromText(text, ['Pr[ée]paration']);
  const cuissonSections = extractSectionBlocksFromText(text, ['Cuisson']);

  const ingredients = uniqueIngredients(
    ingredientsSections.flat().map(line => line.replace(/^[-*•]\s*/, '')).filter(line => {
      if (!line) return false;
      if (/^temps de /i.test(line)) return false;
      if (/^pour\s+/i.test(line)) return false;
      if (/^image\s*:/i.test(line)) return false;
      if (/^note de cuisine\s*:/i.test(line)) return false;
      if (/^pour la d[eé]co\s*:/i.test(line)) return false;
      return true;
    })
  );

  const instructions = uniqueParagraphs([
    ...prepSections.flat().map(line => line.replace(/^[-*•]\s*/, '')),
    ...cuissonSections.flat().map(line => line.replace(/^[-*•]\s*/, '')),
  ].filter(line => {
    if (!line) return false;
    if (/^image\s*:/i.test(line)) return false;
    if (/^(temps de |pour\s+\d+|note de cuisine)/i.test(line)) return false;
    return true;
  }));

  const totalPrep = lines.find(line => /^Temps de pr[ée]paration\s*:/i.test(line)) || '';
  const totalCook = lines.find(line => /^Temps de cuisson\s*:/i.test(line)) || '';
  const totalTimeInline = lines.find(line => /^Temps de pr[ée]paration\s*:.+Temps de cuisson\s*:/i.test(line)) || '';
  const totalTime = cleanInline(totalTimeInline || [totalPrep, totalCook].filter(Boolean).join(' - '));
  const recipeYield = cleanInline(lines.find(line => /^Pour\s+\d+/i.test(line)) || '');

  const description = '';
  const snapshot = normalizeSnapshot({
    sourceUrl,
    title,
    description,
    ingredients,
    instructions,
    totalTime,
    recipeYield,
    image: '',
    savedAt: new Date().toISOString(),
  });

  return {
    url: sourceUrl,
    title,
    description,
    image: '',
    ingredients,
    instructions,
    totalTime,
    recipeYield,
    category: chooseCategory(title, description),
    snapshot,
    success: Boolean(title || ingredients.length || instructions.length),
  };
}

async function fetchReadableMirror(url) {
  const readableUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
  const response = await fetch(readableUrl, {
    headers: {
      'accept': 'text/plain, text/markdown;q=0.9, */*;q=0.8',
      'x-no-cache': '1'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`Impossible de lire cette recette (${response.status}).`);
  return await response.text();
}

function canonicalizeRecipeUrl(rawUrl) {
  let value = String(rawUrl || '').trim();
  value = value.replace(/(?<=\.html)\/+$/i, '');
  value = value.replace(/(?<=\.htm)\/+$/i, '');
  return value;
}

function importFromHtml(sourceUrl, html) {
  const parsedUrl = new URL(sourceUrl);
  const hostname = parsedUrl.hostname.replace(/^www\./, '');
  const recipeObj = parseJsonLdRecipe(html);
  const jsonRecipe = normalizeJsonLdRecipe(recipeObj);

  const title = jsonRecipe.title || extractMeta(html, 'og:title') || extractTitleTag(html) || smartTitleFromUrl(sourceUrl);
  const description = jsonRecipe.description || extractMeta(html, 'description') || extractMeta(html, 'og:description') || '';

  const imageCandidates = [jsonRecipe.image, extractMeta(html, 'og:image'), extractMeta(html, 'twitter:image'), ...extractImageCandidatesFromHtml(html)].filter(Boolean);
  const image = chooseBestImage(imageCandidates, sourceUrl);

  let ingredients = jsonRecipe.ingredients;
  let instructions = jsonRecipe.instructions;

  if (hostname.includes('marmiton.org')) {
    const marmitonStructuredIngredients = extractMarmitonIngredientsFromScripts(html);
    const marmitonVisibleIngredients = extractMarmitonIngredients(html);
    const marmitonInstructions = extractMarmitonInstructions(html);
    if (marmitonStructuredIngredients.length >= 3) ingredients = marmitonStructuredIngredients;
    else if (marmitonVisibleIngredients.length >= 3) ingredients = marmitonVisibleIngredients;
    if (marmitonInstructions.length >= 2) instructions = marmitonInstructions;
  }

  if (!ingredients.length) ingredients = genericIngredientFallback(html);
  if (!instructions.length) instructions = genericInstructionFallback(html);

  const snapshot = normalizeSnapshot({
    sourceUrl,
    title,
    description,
    ingredients,
    instructions,
    totalTime: jsonRecipe.totalTime,
    recipeYield: jsonRecipe.recipeYield,
    image,
    savedAt: new Date().toISOString(),
  });

  return {
    url: sourceUrl,
    title,
    description,
    image,
    ingredients,
    instructions,
    totalTime: jsonRecipe.totalTime || '',
    recipeYield: jsonRecipe.recipeYield || '',
    category: chooseCategory(title, description),
    snapshot,
    success: Boolean(title || ingredients.length || instructions.length || image),
  };
}

async function importRecipeFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(canonicalizeRecipeUrl(url));
  } catch {
    throw new Error('Lien invalide.');
  }

  const candidates = [parsed.toString()];
  if (/\.html$/i.test(parsed.pathname)) {
    candidates.push(parsed.toString() + '/');
  } else if (/\.html\/$/i.test(url)) {
    candidates.push(parsed.toString().replace(/\/$/, ''));
  }

  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'referer': parsed.origin + '/'
  };

  let lastStatus = 0;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, { headers, redirect: 'follow' });
      lastStatus = response.status;
      if (response.ok) {
        const html = await response.text();
        const imported = importFromHtml(candidate, html);
        if (imported.success && (imported.ingredients.length || imported.instructions.length)) {
          return imported;
        }
      }
    } catch {
    }
  }

  try {
    const readable = await fetchReadableMirror(parsed.toString());
    const imported = parseRecipeFromReadableText(parsed.toString(), readable);
    if (imported.success && (imported.ingredients.length || imported.instructions.length)) {
      return imported;
    }
  } catch {
  }

  throw new Error(`Impossible d'importer correctement cette recette${lastStatus ? ` (${lastStatus})` : ''}.`);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type'
    }});
  }

  try {
    if (url.pathname === '/api/health' && method === 'GET') {
      return json({ ok: true, storage: 'd1' });
    }
    if (url.pathname === '/api/recipes' && method === 'GET') {
      return json(await listRecipes(env));
    }
    if (url.pathname === '/api/recipes' && method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      return json(await createRecipe(env, payload), 201);
    }
    if (url.pathname.startsWith('/api/recipes/')) {
      const id = url.pathname.split('/').pop();
      if (!id) return badRequest('Identifiant manquant.');
      if (method === 'PUT') {
        const payload = await request.json().catch(() => ({}));
        const updated = await updateRecipe(env, id, payload);
        return updated ? json(updated) : json({ error: 'Recette introuvable.' }, 404);
      }
      if (method === 'DELETE') {
        await deleteRecipe(env, id);
        return json({ ok: true });
      }
    }
    if (url.pathname === '/api/import' && method === 'POST') {
      const payload = await request.json().catch(() => ({}));
      if (!payload.url) return badRequest('Lien manquant.');
      return json(await importRecipeFromUrl(payload.url));
    }
    if (url.pathname === '/api/export/json' && method === 'GET') {
      const recipes = await listRecipes(env);
      return json(recipes, 200, { 'content-disposition': 'attachment; filename="mes-recettes.json"' });
    }
    if (url.pathname === '/api/export/csv' && method === 'GET') {
      const recipes = await listRecipes(env);
      return textResponse(buildCsv(recipes), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="mes-recettes.csv"'
      });
    }
    return json({ error: 'Route API introuvable.' }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erreur interne.' }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
