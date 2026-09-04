// ============================================================
//  APP.JS - Marketplace & Product Pages (FCFA)
//  Les fonctions de devise sont dans config.js
// ============================================================

let ebooks = [];
let currentPage = 'marketplace';
let activeCategory = 'Tous';
let activeLevel = 'Tous';
let searchQuery = '';
let productViewId = null;

// ============================================================
//  CART
// ============================================================
let cart = [];

function loadCart() {
  try {
    const data = localStorage.getItem('gagne:cart');
    if (data) cart = JSON.parse(data);
    else cart = [];
  } catch(e) { cart = []; }
  updateCartUI();
}

function saveCart() {
  try { localStorage.setItem('gagne:cart', JSON.stringify(cart)); }
  catch(e) {}
  updateCartUI();
}

function addToCart(id) {
  const ebook = ebooks.find(e => e.id === id);
  if (!ebook) { showToast('Guide introuvable'); return; }
  
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...ebook, qty: 1 });
  }
  saveCart();
  showToast(`🛒 "${ebook.title}" ajouté au panier`);
  
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.classList.remove('pop');
    setTimeout(() => badge.classList.add('pop'), 10);
  }
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  if (cart.length === 0) toggleCart();
  else renderCartItems();
}

function updateQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    removeFromCart(id);
    return;
  }
  saveCart();
  renderCartItems();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function updateCartUI() {
  const count = getCartCount();
  const badge = document.getElementById('cartCount');
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function toggleCart() {
  const overlay = document.getElementById('cartModalOverlay');
  if (!overlay) return;
  
  if (overlay.classList.contains('show')) {
    overlay.classList.remove('show');
  } else {
    renderCartItems();
    overlay.classList.add('show');
  }
}

function renderCartItems() {
  const empty = document.getElementById('cartEmpty');
  const items = document.getElementById('cartItems');
  const summary = document.getElementById('cartSummary');

  if (!empty || !items || !summary) return;

  if (cart.length === 0) {
    empty.style.display = 'block';
    items.style.display = 'none';
    summary.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  items.style.display = 'block';
  summary.style.display = 'block';

  items.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="item-thumb" style="background-image: url('${item.image || DEFAULT_IMAGE}');"></div>
      <div class="item-info">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-price">${fmtPrice(item.price)}</div>
      </div>
      <div class="item-actions">
        <button onclick="updateQty('${item.id}', -1)">−</button>
        <span class="item-qty">${item.qty}</span>
        <button onclick="updateQty('${item.id}', 1)">+</button>
        <button onclick="removeFromCart('${item.id}')" style="border-color:#C1442E; color:#C1442E;">✕</button>
      </div>
    </div>
  `).join('');

  const totalPrice = document.getElementById('cartTotalPrice');
  if (totalPrice) totalPrice.textContent = fmtPrice(getCartTotal());
}

function checkoutCart() {
  if (cart.length === 0) { showToast('🛒 Panier vide'); return; }
  toggleCart();
  openPaymentForCart();
}

function openPaymentForCart() {
  if (cart.length === 0) return;
  const total = getCartTotal();
  const titles = cart.map(item => item.title).join(', ');
  
  const payTitle = document.getElementById('payTitle');
  const payTotal = document.getElementById('payTotal');
  const paymentSub = document.getElementById('paymentSub');
  const payPhone = document.getElementById('payPhone');
  const overlay = document.getElementById('paymentModalOverlay');
  
  if (payTitle) payTitle.textContent = titles;
  if (payTotal) payTotal.textContent = fmtPrice(total);
  if (paymentSub) paymentSub.textContent = `Tu achètes ${cart.length} guide${cart.length > 1 ? 's' : ''}`;
  if (payPhone) payPhone.value = '';
  if (overlay) overlay.classList.add('show');
  
  window._cartForPayment = cart;
}

// ============================================================
//  SHARE DROPDOWN
// ============================================================
function toggleShare(e, id) {
  e.stopPropagation();
  const existing = document.querySelector('.share-dropdown');
  if (existing) existing.remove();

  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.className = 'share-dropdown';
  dropdown.style.position = 'fixed';
  dropdown.style.top = (rect.bottom + 8) + 'px';
  dropdown.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
  dropdown.innerHTML = `
    <button onclick="shareProduct('${id}', 'copy')">📋 Copier le lien</button>
    <button onclick="shareProduct('${id}', 'whatsapp')">💬 WhatsApp</button>
    <button onclick="shareProduct('${id}', 'facebook')">📘 Facebook</button>
  `;
  document.body.appendChild(dropdown);

  setTimeout(() => {
    document.addEventListener('click', function closeDropdown(e) {
      if (!dropdown.contains(e.target) && e.target !== btn) {
        dropdown.remove();
        document.removeEventListener('click', closeDropdown);
      }
    });
  }, 10);
}

// ============================================================
//  SHARE FUNCTIONS
// ============================================================
function getProductUrl(id) {
  const base = window.location.origin + window.location.pathname;
  return base + '?product=' + id;
}

function copyProductLink(id) {
  const url = getProductUrl(id || productViewId);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => showToast('✅ Lien copié !')).catch(() => {
      fallbackCopy(url);
    });
  } else {
    fallbackCopy(url);
  }
  document.querySelector('.share-dropdown')?.remove();
}

function fallbackCopy(text) {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  showToast('✅ Lien copié !');
}

function shareProduct(id, platform) {
  const url = getProductUrl(id || productViewId);
  const e = ebooks.find(x => x.id === (id || productViewId));
  if (!e) return;
  const text = `📚 Découvre "${e.title}" sur GAGNE ! ${url}`;
  let shareUrl = '';
  if (platform === 'whatsapp') shareUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  else if (platform === 'facebook') shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  else if (platform === 'copy') {
    copyProductLink(id);
    return;
  }
  if (shareUrl) window.open(shareUrl, '_blank');
  document.querySelector('.share-dropdown')?.remove();
}

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
      console.log('📚 Ebooks chargés depuis localStorage:', ebooks.length);
      return;
    }
  } catch (e) {
    console.error('Erreur chargement ebooks:', e);
  }
  
  // ============================================================
  //  SUPPRESSION DU SEED DATA - BASE VIDE
  // ============================================================
  console.log('📚 Aucun ebook en base, la boutique est vide');
  ebooks = [];
  await persist();
}

async function persist() {
  try { await storage.set('gagne:ebooks', JSON.stringify(ebooks)); }
  catch (e) { console.error('Erreur de sauvegarde', e); }
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
//  NAVIGATION
// ============================================================
function navigate(page, params) {
  currentPage = page;
  if (page === 'product' && params) {
    const url = new URL(window.location);
    url.searchParams.set('product', params);
    window.history.pushState({ page, id: params }, '', url);
    productViewId = params;
    showPage('product');
    renderProduct(params);
  } else {
    const url = new URL(window.location);
    url.searchParams.delete('product');
    window.history.pushState({ page: 'marketplace' }, '', url);
    showPage('marketplace');
    renderAll();
  }
}

function showPage(page) {
  const marketplace = document.getElementById('page-marketplace');
  const product = document.getElementById('page-product');
  if (marketplace) marketplace.style.display = page === 'marketplace' ? 'block' : 'none';
  if (product) product.style.display = page === 'product' ? 'block' : 'none';
}

window.addEventListener('popstate', (e) => {
  const url = new URL(window.location);
  const productId = url.searchParams.get('product');
  if (productId) { navigate('product', productId); }
  else { navigate('marketplace'); }
});

// ============================================================
//  RENDER: Marketplace
// ============================================================
function renderCategoryPills() {
  const container = document.getElementById('categoryPills');
  if (!container) return;
  
  const cats = getCategories();
  let html = `<span class="row-label">Catégorie</span>`;
  html += `<button class="pill ${activeCategory === 'Tous' ? 'active' : ''}" data-cat="Tous">Tous</button>`;
  cats.forEach(c => {
    html += `<button class="pill ${activeCategory === c ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      renderCategoryPills();
      renderGrid();
    });
  });
}

function getFiltered() {
  let list = ebooks.slice();
  if (activeCategory !== 'Tous') list = list.filter(e => e.category === activeCategory);
  if (activeLevel !== 'Tous') list = list.filter(e => e.level === activeLevel);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(e =>
      e.title.toLowerCase().includes(q) ||
      e.tagline.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    );
  }
  const sort = document.getElementById('sortSelect');
  const sortValue = sort ? sort.value : 'recent';
  if (sortValue === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (sortValue === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (sortValue === 'alpha') list.sort((a, b) => a.title.localeCompare(b.title));
  else list.sort((a, b) => b.createdAt - a.createdAt);
  return list;
}

function coverHTML(e, big) {
  const img = e.image || DEFAULT_IMAGE;
  return `<div class="${big ? 'detail-cover' : 'cover'} cv-${e.color}" style="background-image: url('${escapeHtml(img)}');">
    <div class="cover-overlay"></div>
    <div class="cat">${escapeHtml(e.category)}</div>
    <div class="ctitle">${escapeHtml(e.title)}</div>
  </div>`;
}

function renderGrid() {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('emptyState');
  if (!grid) {
    console.error('❌ Élément #grid introuvable !');
    return;
  }
  
  const list = getFiltered();
  console.log('📦 Produits à afficher:', list.length);
  
  if (list.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  
  grid.innerHTML = list.map(e => `
    <div class="card">
      ${coverHTML(e, false)}
      <div class="card-body">
        <h3>${escapeHtml(e.title)}</h3>
        <p class="tagline">${escapeHtml(e.tagline)}</p>
        <div class="meta-row">
          <span>${escapeHtml(e.level)}</span>
          <span class="div"></span>
          <span>${e.pages} pages</span>
        </div>
        <div class="card-foot">
          <span class="price">${fmtPrice(e.price)}</span>
          <div class="card-actions">
            <button class="view-btn" onclick="navigate('product', '${e.id}')">Voir</button>
            <button class="pay-btn" onclick="addToCart('${e.id}')">🛒</button>
            <button class="share-trigger" onclick="toggleShare(event, '${e.id}')">📤</button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function renderHeroStats() {
  const stats = document.getElementById('heroStats');
  if (!stats) return;
  
  const cats = getCategories().length;
  stats.innerHTML = `
    <div class="stat"><b>${ebooks.length}</b><span>${ebooks.length > 1 ? 'ebooks publiés' : 'ebook publié'}</span></div>
    <div class="stat"><b>${cats}</b><span>${cats > 1 ? 'catégories disponibles' : 'catégorie disponible'}</span></div>
    <div class="stat"><b>💡</b><span>100% numérique, accès immédiat</span></div>
  `;
}

// ============================================================
//  RENDER: Product
// ============================================================
function renderProduct(id) {
  const e = ebooks.find(x => x.id === id);
  if (!e) { showToast('Guide introuvable'); navigate('marketplace'); return; }
  productViewId = id;
  const img = e.image || DEFAULT_IMAGE;
  
  const productImage = document.getElementById('productImage');
  const productTitle = document.getElementById('productTitle');
  const productCategory = document.getElementById('productCategory');
  const productLevel = document.getElementById('productLevel');
  const productPages = document.getElementById('productPages');
  const productPrice = document.getElementById('productPrice');
  const productDesc = document.getElementById('productDesc');
  const productAddToCart = document.getElementById('productAddToCart');
  const productBuyNow = document.getElementById('productBuyNow');
  
  if (productImage) productImage.src = img;
  if (productTitle) productTitle.textContent = e.title;
  if (productCategory) productCategory.textContent = e.category;
  if (productLevel) productLevel.textContent = e.level;
  if (productPages) productPages.textContent = e.pages + ' pages';
  if (productPrice) productPrice.textContent = fmtPrice(e.price);
  if (productDesc) productDesc.textContent = e.description;
  if (productAddToCart) productAddToCart.onclick = () => addToCart(e.id);
  if (productBuyNow) {
    productBuyNow.onclick = () => {
      addToCart(e.id);
      setTimeout(() => openPaymentForCart(), 300);
    };
  }
  document.title = `GAGNE — ${e.title}`;
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
//  RENDER ALL
// ============================================================
function renderAll() {
  renderHeroStats();
  renderCategoryPills();
  renderGrid();
  if (currentPage === 'product' && productViewId) renderProduct(productViewId);
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 GAGNE - Initialisation...');
  
  loadEbooks().then(() => {
    console.log('📚 Ebooks chargés:', ebooks.length);
    loadCart();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (ev) => {
        searchQuery = ev.target.value;
        if (currentPage === 'marketplace') renderGrid();
      });
    }

    document.querySelectorAll('[data-level]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLevel = btn.dataset.level;
        document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (currentPage === 'marketplace') renderGrid();
      });
    });

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        if (currentPage === 'marketplace') renderGrid();
      });
    }

    const cartOverlay = document.getElementById('cartModalOverlay');
    if (cartOverlay) {
      cartOverlay.addEventListener('click', (ev) => {
        if (ev.target.id === 'cartModalOverlay') toggleCart();
      });
    }

    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const cartOverlay = document.getElementById('cartModalOverlay');
        if (cartOverlay && cartOverlay.classList.contains('show')) toggleCart();
        const paymentOverlay = document.getElementById('paymentModalOverlay');
        if (paymentOverlay && paymentOverlay.classList.contains('show')) {
          if (typeof closePayment === 'function') closePayment();
        }
      }
    });

    const url = new URL(window.location);
    const productId = url.searchParams.get('product');
    if (productId) { navigate('product', productId); }
    else { 
      console.log('🏠 Affichage de la marketplace');
      navigate('marketplace'); 
    }
  });
});