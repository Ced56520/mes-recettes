const apiBase = '';
let recipes = [];
let editingId = null;
let activeQuickCategory = '';
let toastTimer = null;
let currentSnapshot = null;
let currentSnapshotText = '';
let wakeLock = null;
let wakeVideo = null;
let wakeLoopTimer = null;

const el = id => document.getElementById(id);
const categories = ['Entrée', 'Plat', 'Dessert', 'Apéritif', 'Petit-déjeuner', 'Boisson', 'Sauce', 'Autre'];

function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIngredients(text) {
  return String(text || '')
    .split(/[\n;,]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function request(path, options = {}) {
  return fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Erreur');
    return data;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function cleanClientText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function loadRecipes() {
  recipes = (await request('/api/recipes')).map(recipe => ({
    ...recipe,
    title: cleanClientText(recipe.title),
    notes: cleanClientText(recipe.notes),
    image: recipe.image || '',
    ingredients: (recipe.ingredients || []).map(cleanClientText).filter(Boolean),
    snapshot: recipe.snapshot ? {
      ...recipe.snapshot,
      title: cleanClientText(recipe.snapshot.title),
      description: cleanClientText(recipe.snapshot.description),
      image: recipe.snapshot.image || '',
      ingredients: (recipe.snapshot.ingredients || []).map(cleanClientText).filter(Boolean),
      instructions: (recipe.snapshot.instructions || []).map(cleanClientText).filter(Boolean),
      totalTime: cleanClientText(recipe.snapshot.totalTime),
      recipeYield: cleanClientText(recipe.snapshot.recipeYield)
    } : null
  }));
  renderAll();
}

function renderQuickCategories() {
  el('quickCategories').innerHTML = [
    `<button class="quick-filter-chip ${!activeQuickCategory ? 'active' : ''}" data-cat="">Toutes</button>`,
    ...categories.map(cat => `<button class="quick-filter-chip ${activeQuickCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>`)
  ].join('');
  document.querySelectorAll('.quick-filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeQuickCategory = btn.dataset.cat || '';
      el('filterCategory').value = activeQuickCategory;
      renderRecipes();
      renderQuickCategories();
    });
  });
}

function getFilteredRecipes() {
  const available = parseIngredients(el('availableIngredients').value).map(normalize);
  const searchTerms = normalize(el('searchText').value).split(' ').filter(Boolean);
  const category = activeQuickCategory || el('filterCategory').value;
  const favOnly = el('filterFav').value === 'fav';

  return recipes
    .map(recipe => {
      const ing = (recipe.ingredients || []).map(normalize);
      const matched = available.filter(a => ing.some(i => i.includes(a) || a.includes(i)));
      return { ...recipe, matchCount: [...new Set(matched)].length };
    })
    .filter(recipe => {
      const hay = normalize([
        recipe.title,
        recipe.notes,
        (recipe.ingredients || []).join(' '),
        recipe.snapshot?.description || '',
        (recipe.snapshot?.ingredients || []).join(' ')
      ].join(' '));
      const matchesSearch = !searchTerms.length || searchTerms.every(term => hay.includes(term));
      const matchesAvailable = !available.length || recipe.matchCount === available.length;
      return matchesSearch && matchesAvailable &&
        (!category || recipe.category === category) &&
        (!favOnly || recipe.favorite);
    })
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      if (Number(b.favorite) !== Number(a.favorite)) return Number(b.favorite) - Number(a.favorite);
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
}

function renderStats() {
  const stats = [
    { label: 'Recettes', value: recipes.length },
    { label: 'Favoris', value: recipes.filter(r => r.favorite).length },
    { label: 'Catégories', value: new Set(recipes.map(r => r.category)).size },
    { label: 'Copies', value: recipes.filter(r => r.snapshot).length },
  ];
  el('stats').innerHTML = stats.map(stat => `
    <div class="stat">
      <div class="label">${escapeHtml(stat.label)}</div>
      <div class="value">${stat.value}</div>
    </div>
  `).join('');
}

function renderRecipes() {
  const filtered = getFilteredRecipes();
  renderStats();
  el('resultsSummary').textContent = filtered.length ? `${filtered.length} recette(s) affichée(s)` : 'Aucune recette trouvée';

  if (!filtered.length) {
    el('recipesGrid').innerHTML = '<div class="empty">Aucune recette trouvée.</div>';
    return;
  }

  el('recipesGrid').innerHTML = filtered.map(recipe => {
    const displayIngredients = (recipe.ingredients?.length ? recipe.ingredients : recipe.snapshot?.ingredients || []).slice(0, 6);
    const imageHtml = recipe.image
      ? `<img src="${escapeHtml(recipe.image)}" alt="${escapeHtml(recipe.title)}" onerror="this.parentNode.textContent='Aucune image';" />`
      : 'Aucune image';
    return `
      <article class="recipe-card">
        <div class="recipe-image">${imageHtml}</div>
        <div class="recipe-body">
          <div class="badges">
            <span class="badge">${escapeHtml(recipe.category || 'Autre')}</span>
            ${recipe.favorite ? '<span class="badge">Favori</span>' : ''}
            ${recipe.snapshot ? '<span class="badge">Copie sauvegardée</span>' : ''}
          </div>
          <div class="recipe-head">
            <h3>${escapeHtml(recipe.title)}</h3>
            <button class="fav-btn" type="button" onclick="toggleFavorite('${recipe.id}')">${recipe.favorite ? '⭐' : '☆'}</button>
          </div>
          <div style="margin-top:8px;">${recipe.url ? `<a class="link" href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener noreferrer">Ouvrir la recette</a>` : '<span class="muted">Aucun lien</span>'}</div>
          ${recipe.matchCount > 0 ? `<div class="match">${recipe.matchCount} ingrédient(s) trouvé(s)</div>` : ''}
          ${(recipe.notes || recipe.snapshot?.description) ? `<p class="description-preview muted">${escapeHtml(recipe.notes || recipe.snapshot?.description)}</p>` : ''}
          ${recipe.snapshot?.instructions?.length ? `<p class="archive-preview">Copie locale : ${recipe.snapshot.instructions.length} étape(s) enregistrée(s).</p>` : ''}
          <div class="ingredient-label">${displayIngredients.length ? 'Ingrédients' : 'Aucun ingrédient détecté'}</div>
          ${displayIngredients.length ? `<ul class="ingredients-list">${displayIngredients.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        </div>
        <div class="recipe-actions ${recipe.snapshot ? '' : 'two'}">
          ${recipe.snapshot ? `<button class="btn secondary" type="button" onclick="openSnapshotModal('${recipe.id}')">Voir copie</button>` : ''}
          <button class="btn secondary" type="button" onclick="openEditModal('${recipe.id}')">Modifier</button>
          <button class="btn secondary" type="button" onclick="removeRecipe('${recipe.id}')">Supprimer</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderAll() {
  renderQuickCategories();
  renderRecipes();
}


async function enableWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
      return true;
    }
  } catch {}

  try {
    if (!wakeVideo) {
      wakeVideo = document.createElement('video');
      wakeVideo.setAttribute('playsinline', '');
      wakeVideo.setAttribute('muted', '');
      wakeVideo.muted = true;
      wakeVideo.loop = true;
      wakeVideo.style.position = 'fixed';
      wakeVideo.style.width = '1px';
      wakeVideo.style.height = '1px';
      wakeVideo.style.opacity = '0.001';
      wakeVideo.style.pointerEvents = 'none';
      wakeVideo.style.bottom = '0';
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 2, 2);
      wakeVideo.src = canvas.captureStream(1).getTracks().length ? URL.createObjectURL(new Blob()) : '';
      try { wakeVideo.srcObject = canvas.captureStream(1); } catch {}
      document.body.appendChild(wakeVideo);
    }
    await wakeVideo.play().catch(() => {});
    clearInterval(wakeLoopTimer);
    wakeLoopTimer = setInterval(() => { if (wakeVideo && wakeVideo.paused) wakeVideo.play().catch(() => {}); }, 15000);
    return true;
  } catch {}
  return false;
}

async function disableWakeLock() {
  clearInterval(wakeLoopTimer);
  wakeLoopTimer = null;
  try { await wakeLock?.release(); } catch {}
  wakeLock = null;
  try { wakeVideo?.pause(); } catch {}
}

function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

function openModal(node) {
  node.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModal(node) {
  node.classList.add('hidden');
  if (node.id === 'snapshotModal') disableWakeLock();
  if (document.querySelectorAll('.modal:not(.hidden)').length === 0) {
    document.body.classList.remove('modal-open');
  }
}

function setActiveCategoryChip(value) {
  el('category').value = value;
  document.querySelectorAll('.category-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

function setSnapshot(snapshot) {
  currentSnapshot = snapshot || null;
  const status = el('snapshotStatus');
  if (!snapshot) {
    status.textContent = 'Aucune copie locale enregistrée pour cette recette.';
    status.classList.remove('active');
    return;
  }
  status.textContent = `Copie locale prête : ${snapshot.ingredients?.length || 0} ingrédient(s), ${snapshot.instructions?.length || 0} étape(s).`;
  status.classList.add('active');
}

function resetForm() {
  editingId = null;
  el('formEyebrow').textContent = 'Ajouter / modifier';
  el('formTitle').textContent = 'Fiche recette';
  el('title').value = '';
  el('url').value = '';
  el('image').value = '';
  el('ingredients').value = '';
  el('notes').value = '';
  setActiveCategoryChip('Entrée');
  setSnapshot(null);
}

async function openImportModalWithUrl(url) {
  const importBtn = el('importBtn');
  const importInput = el('importUrl');
  if (!url || !url.trim()) {
    showToast('Colle un lien avant de lancer l’import.');
    return;
  }
  if (importBtn.disabled) return;
  const previousLabel = importBtn.textContent;
  importBtn.disabled = true;
  importBtn.textContent = 'Import...';
  try {
    const imported = await request('/api/import', {
      method: 'POST',
      body: JSON.stringify({ url: url.trim() })
    });
    resetForm();
    el('formEyebrow').textContent = 'Import automatique';
    el('formTitle').textContent = 'Vérifie puis enregistre';
    el('title').value = imported.title || '';
    el('url').value = imported.url || url.trim();
    el('image').value = imported.image || '';
    el('ingredients').value = (imported.ingredients || []).join('\n');
    el('notes').value = imported.description || '';
    const guessed = imported.category || inferCategory(imported.title || '', imported.description || '');
    setActiveCategoryChip(guessed);
    setSnapshot(imported.snapshot || null);
    importInput.value = '';
    openModal(el('editModal'));
    showToast('Import terminé.');
  } catch (error) {
    showToast(error.message || 'Import impossible.');
  } finally {
    importBtn.disabled = false;
    importBtn.textContent = previousLabel;
  }
}

function inferCategory(title, description) {
  const text = normalize(`${title} ${description}`);
  if (/dessert|gateau|gâteau|tarte|mousse|cookie|biscuit|crepe|crêpe|brownie|glace/.test(text)) return 'Dessert';
  if (/apero|apero|toast|rillettes|verrine/.test(text)) return 'Apéritif';
  if (/boisson|cocktail|jus|smoothie/.test(text)) return 'Boisson';
  if (/sauce|bechamel|béchamel|poivre|vinaigrette|pesto|coulis|mayonnaise|aioli|a[iï]oli/.test(text)) return 'Sauce';
  if (/brunch|petit dej|petit déjeuner/.test(text)) return 'Petit-déjeuner';
  if (/entree|salade|veloute|velouté|soupe|quiche/.test(text)) return 'Entrée';
  return 'Plat';
}

async function submitForm(event) {
  event.preventDefault();
  const payload = {
    title: el('title').value.trim(),
    url: el('url').value.trim(),
    category: el('category').value,
    image: el('image').value.trim(),
    ingredients: parseIngredients(el('ingredients').value),
    notes: el('notes').value.trim(),
    snapshot: currentSnapshot
  };
  if (!payload.title && !payload.url) {
    showToast('Ajoute au moins un titre ou un lien.');
    return;
  }
  try {
    if (editingId) {
      await request(`/api/recipes/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Recette modifiée.');
    } else {
      await request('/api/recipes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Recette enregistrée.');
    }
    closeModal(el('editModal'));
    resetForm();
    await loadRecipes();
  } catch (error) {
    showToast(error.message || 'Erreur.');
  }
}

function openEditModal(id) {
  const recipe = recipes.find(item => item.id === id);
  if (!recipe) return;
  editingId = id;
  el('formEyebrow').textContent = 'Modifier';
  el('formTitle').textContent = recipe.title;
  el('title').value = recipe.title || '';
  el('url').value = recipe.url || '';
  el('image').value = recipe.image || '';
  el('ingredients').value = (recipe.ingredients || []).join('\n');
  el('notes').value = recipe.notes || '';
  setActiveCategoryChip(recipe.category || 'Entrée');
  setSnapshot(recipe.snapshot || null);
  openModal(el('editModal'));
}

function formatSnapshotText(snapshot) {
  if (!snapshot) return '';
  const parts = [];
  parts.push(snapshot.title || 'Recette');
  if (snapshot.description) parts.push('', snapshot.description);
  if (snapshot.ingredients?.length) parts.push('', 'Ingrédients', ...snapshot.ingredients.map(item => `• ${item}`));
  if (snapshot.instructions?.length) parts.push('', 'Étapes', ...snapshot.instructions.map((step, index) => `${index + 1}. ${step}`));
  if (snapshot.totalTime || snapshot.recipeYield) {
    parts.push('', 'Infos');
    if (snapshot.totalTime) parts.push(`Temps : ${snapshot.totalTime}`);
    if (snapshot.recipeYield) parts.push(`Portions : ${snapshot.recipeYield}`);
  }
  return parts.join('\n');
}

function openSnapshotModal(id) {
  const recipe = recipes.find(item => item.id === id);
  if (!recipe?.snapshot) return;
  currentSnapshotText = formatSnapshotText(recipe.snapshot);
  el('snapshotTitle').textContent = recipe.snapshot.title || recipe.title || 'Recette';
  el('snapshotContent').innerHTML = `
    ${recipe.snapshot.description ? `<p class="snapshot-description muted">${escapeHtml(recipe.snapshot.description)}</p>` : ''}
    <div class="snapshot-meta">
      ${recipe.snapshot.totalTime ? `<span class="meta-pill">Temps : ${escapeHtml(recipe.snapshot.totalTime)}</span>` : ''}
      ${recipe.snapshot.recipeYield ? `<span class="meta-pill">Portions : ${escapeHtml(recipe.snapshot.recipeYield)}</span>` : ''}
    </div>
    ${recipe.snapshot.ingredients?.length ? `<section class="snapshot-block"><h3>Ingrédients</h3><ul>${recipe.snapshot.ingredients.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>` : ''}
    ${recipe.snapshot.instructions?.length ? `<section class="snapshot-block"><h3>Étapes</h3><ol>${recipe.snapshot.instructions.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol></section>` : ''}
  `;
  openModal(el('snapshotModal'));
  enableWakeLock();
}

async function toggleFavorite(id) {
  const recipe = recipes.find(item => item.id === id);
  if (!recipe) return;
  await request(`/api/recipes/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ favorite: !recipe.favorite })
  });
  await loadRecipes();
}

async function removeRecipe(id) {
  if (!confirm('Supprimer cette recette ?')) return;
  await request(`/api/recipes/${id}`, { method: 'DELETE' });
  showToast('Recette supprimée.');
  await loadRecipes();
}

async function exportFile(path, filename) {
  const response = await fetch(path);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  el('importBtn').addEventListener('click', () => openImportModalWithUrl(el('importUrl').value));
  el('recipeForm').addEventListener('submit', submitForm);
  el('cancelBtn').addEventListener('click', () => { closeModal(el('editModal')); resetForm(); });
  el('closeEditBtn').addEventListener('click', () => { closeModal(el('editModal')); resetForm(); });
  el('closeSnapshotBtn').addEventListener('click', () => closeModal(el('snapshotModal')));
  el('copySnapshotBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(currentSnapshotText || '');
    showToast('Copie texte copiée.');
  });
  el('exportJsonBtn').addEventListener('click', () => exportFile('/api/export/json', 'mes-recettes.json'));
  el('exportCsvBtn').addEventListener('click', () => exportFile('/api/export/csv', 'mes-recettes.csv'));
  el('scrollTopBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  el('searchText').addEventListener('input', renderRecipes);
  el('availableIngredients').addEventListener('input', renderRecipes);
  el('filterCategory').addEventListener('change', () => { activeQuickCategory = el('filterCategory').value; renderAll(); });
  el('filterFav').addEventListener('change', renderRecipes);

  document.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => setActiveCategoryChip(btn.dataset.value));
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !el('snapshotModal').classList.contains('hidden')) enableWakeLock();
  });
}


bindEvents();
loadRecipes().catch(error => showToast(error.message || 'Erreur de chargement.'));
window.toggleFavorite = toggleFavorite;
window.removeRecipe = removeRecipe;
window.openEditModal = openEditModal;
window.openSnapshotModal = openSnapshotModal;
