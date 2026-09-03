// ============================================================
//  ADMIN.JS - Dashboard Admin (FCFA)
// ============================================================

let ebooks = [];
let editingId = null;
let uploadedImageData = null;

// ============================================================
//  STORAGE
// ============================================================
const storage = {
  get: (key) => {
    try { const val = localStorage.getItem(key); return val ? { value: val } : null; }
    catch (_) { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); return Promise.resolve(); }
    catch (_) { return Promise.reject(); }
  }
};

async function loadEbooks() {
  try {
    const res = await storage.get('gagne:ebooks');
    if (res && res.value) { 
      ebooks = JSON.parse(res.value); 
      console.log('📚 Ebooks chargés:', ebooks.length);
      return;
    }
  } catch (e) {}
  ebooks = [{
    id: 'seed-alibaba',
    title: 'Vendre sur Alibaba',
    tagline: "Importer, revendre et encaisser tes premiers revenus — sans se faire arnaquer.",
    description: "Le guide complet pour choisir un produit rentable, vérifier un fournisseur, négocier, gérer le transport et la douane, et revendre rapidement sur les bons canaux. Inclut un exemple de calcul de marge et un plan d'action sur 7 jours.",
    category: 'Import & E-commerce',
    level: 'Débutant',
    price: 9.90,
    pages: 15,
    color: 'accent',
    link: '',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop',
    createdAt: Date.now() - 100000
  }];
  await persist();
}

async function persist() {
  try { await storage.set('gagne:ebooks', JSON.stringify(ebooks)); }
  catch (e) { console.error('Erreur de sauvegarde', e); showToast("Erreur de sauvegarde"); }
}

// ============================================================
//  HELPERS
// ============================================================
function getCategories() {
  const set = new Set(ebooks.map(e => e.category));
  return Array.from(set);
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ============================================================
//  CHECK AUTH
// ============================================================
function checkAuth() {
  const data = localStorage.getItem('gagne:admin');
  if (!data) { window.location.href = 'login.html'; return false; }
  try {
    const parsed = JSON.parse(data);
    if (parsed.email === 'admin@gagne.com') return true;
  } catch(e) {}
  window.location.href = 'login.html';
  return false;
}

function logout() {
  localStorage.removeItem('gagne:admin');
  window.location.href = 'login.html';
}

// ============================================================
//  RENDER DASHBOARD (Prix en FCFA)
// ============================================================
function renderDashboard() {
  const cats = getCategories().length;
  const avg = ebooks.length ? (ebooks.reduce((s, e) => s + e.price, 0) / ebooks.length) : 0;
  
  const stats = document.getElementById('dashStats');
  if (stats) {
    stats.innerHTML = `
      <div class="dash-stat"><b>${ebooks.length}</b><span>ebook${ebooks.length > 1 ? 's' : ''}</span></div>
      <div class="dash-stat"><b>${cats}</b><span>catégorie${cats > 1 ? 's' : ''}</span></div>
      <div class="dash-stat"><b>${fmtPrice(avg)}</b><span>prix moyen</span></div>
    `;
  }

  const table = document.getElementById('dashTable');
  if (!table) return;
  
  if (ebooks.length === 0) {
    table.innerHTML = `<div class="empty-state" style="border:none;"><h3>Aucun ebook</h3><p>Ajoute ton premier guide !</p></div>`;
    return;
  }
  
  let rows = `<div class="dash-row head">
    <span></span><span>Titre</span><span>Catégorie</span><span class="col-price">Prix</span><span class="col-actions" style="text-align:right;">Actions</span>
  </div>`;
  
  ebooks.slice().sort((a, b) => b.createdAt - a.createdAt).forEach(e => {
    const img = e.image || DEFAULT_IMAGE;
    rows += `<div class="dash-row">
      <div class="dash-thumb" style="background-image: url('${escapeHtml(img)}');"></div>
      <div class="dash-title">${escapeHtml(e.title)}<small>${escapeHtml(e.tagline)}</small></div>
      <span>${escapeHtml(e.category)}</span>
      <span class="col-price">${fmtPrice(e.price)}</span>
      <div class="dash-actions col-actions">
        <button class="icon-btn" onclick="openForm('${e.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
        <button class="icon-btn danger" onclick="deleteEbook('${e.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>`;
  });
  table.innerHTML = rows;
}

// ============================================================
//  CRUD
// ============================================================
async function deleteEbook(id) {
  const e = ebooks.find(x => x.id === id);
  if (!e) return;
  if (!confirm(`Supprimer "${e.title}" ?`)) return;
  ebooks = ebooks.filter(x => x.id !== id);
  await persist();
  renderDashboard();
  showToast('Ebook supprimé');
}

// ============================================================
//  SWATCHES
// ============================================================
function renderSwatches(selected) {
  const c = document.getElementById('swatches');
  if (!c) return;
  
  c.innerHTML = COLOR_KEYS.map(k =>
    `<div class="swatch ${k === selected ? 'selected' : ''}" data-color="${k}" style="background:${COLOR_LABELS[k]}"></div>`
  ).join('');
  c.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      c.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
  });
}

// ============================================================
//  UPLOAD IMAGE
// ============================================================
function setupUpload() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('f-image-file');
  
  if (!uploadArea || !fileInput) return;

  // Click to upload
  uploadArea.addEventListener('click', () => fileInput.click());

  // File change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

function handleFile(file) {
  // Vérifier le type
  if (!file.type.startsWith('image/')) {
    showToast('❌ Veuillez sélectionner une image');
    return;
  }

  // Vérifier la taille (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('❌ L\'image ne doit pas dépasser 5MB');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    uploadedImageData = dataUrl;
    document.getElementById('f-image').value = dataUrl;
    document.getElementById('previewImage').src = dataUrl;
    document.getElementById('uploadPreview').style.display = 'block';
    document.getElementById('uploadArea').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedImageData = null;
  document.getElementById('f-image').value = '';
  document.getElementById('previewImage').src = '';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('f-image-file').value = '';
}

// ============================================================
//  FORM
// ============================================================
function openForm(id) {
  editingId = id || null;
  const overlay = document.getElementById('formModalOverlay');
  if (!overlay) return;
  
  const title = document.getElementById('formModalTitle');
  const submitBtn = document.getElementById('submitModalBtn');
  
  // Reset upload
  removeImage();
  
  if (id) {
    const e = ebooks.find(x => x.id === id);
    if (!e) return;
    title.textContent = "Modifier l'ebook";
    submitBtn.textContent = "Enregistrer";
    document.getElementById('f-title').value = e.title;
    document.getElementById('f-tagline').value = e.tagline;
    document.getElementById('f-desc').value = e.description;
    
    // Si l'image est une URL
    if (e.image && e.image.startsWith('data:image')) {
      uploadedImageData = e.image;
      document.getElementById('f-image').value = e.image;
      document.getElementById('previewImage').src = e.image;
      document.getElementById('uploadPreview').style.display = 'block';
      document.getElementById('uploadArea').style.display = 'none';
    } else if (e.image) {
      document.getElementById('f-image').value = e.image;
    }
    
    document.getElementById('f-category').value = e.category;
    document.getElementById('f-level').value = e.level;
    document.getElementById('f-price').value = Math.round(e.price * 655.96);
    document.getElementById('f-pages').value = e.pages;
    document.getElementById('f-link').value = e.link || '';
    renderSwatches(e.color);
  } else {
    title.textContent = "Ajouter un ebook";
    submitBtn.textContent = "Enregistrer";
    document.getElementById('ebookForm').reset();
    renderSwatches('accent');
    document.getElementById('uploadArea').style.display = 'block';
    document.getElementById('uploadPreview').style.display = 'none';
  }
  overlay.classList.add('show');
}

function closeForm() {
  const overlay = document.getElementById('formModalOverlay');
  if (overlay) overlay.classList.remove('show');
  removeImage();
}

async function submitForm(ev) {
  ev.preventDefault();
  
  const selectedSwatch = document.querySelector('#swatches .swatch.selected');
  const priceFCFA = parseFloat(document.getElementById('f-price').value) || 0;
  // Convertir FCFA en € pour le stockage
  const priceEuro = priceFCFA / 655.96;
  
  const data = {
    title: document.getElementById('f-title').value.trim(),
    tagline: document.getElementById('f-tagline').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    image: document.getElementById('f-image').value.trim() || DEFAULT_IMAGE,
    category: document.getElementById('f-category').value.trim(),
    level: document.getElementById('f-level').value,
    price: Math.round(priceEuro * 100) / 100,
    pages: parseInt(document.getElementById('f-pages').value) || 0,
    link: document.getElementById('f-link').value.trim(),
    color: selectedSwatch ? selectedSwatch.dataset.color : 'accent'
  };
  
  if (editingId) {
    const idx = ebooks.findIndex(x => x.id === editingId);
    if (idx !== -1) {
      ebooks[idx] = { ...ebooks[idx], ...data };
      showToast('✅ Ebook modifié');
    }
  } else {
    const newId = 'e-' + Date.now();
    ebooks.push({ id: newId, createdAt: Date.now(), ...data });
    showToast('✅ Ebook ajouté !');
  }
  await persist();
  closeForm();
  renderDashboard();
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2800);
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  if (!checkAuth()) return;

  loadEbooks().then(() => {
    renderDashboard();
    setupUpload();

    const openBtn = document.getElementById('openAddModal');
    if (openBtn) openBtn.addEventListener('click', () => openForm(null));
    
    const cancelBtn = document.getElementById('cancelModal');
    if (cancelBtn) cancelBtn.addEventListener('click', closeForm);
    
    const form = document.getElementById('ebookForm');
    if (form) form.addEventListener('submit', submitForm);
    
    const overlay = document.getElementById('formModalOverlay');
    if (overlay) {
      overlay.addEventListener('click', (ev) => {
        if (ev.target.id === 'formModalOverlay') closeForm();
      });
    }

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closeForm();
    });
  });
});