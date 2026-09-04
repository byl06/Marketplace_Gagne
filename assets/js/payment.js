// ============================================================
//  PAYMENT.JS - Paiements Bénin (Appel au backend)
// ============================================================

// URL du backend
const BACKEND_URL = 'https://gagne-backend.onrender.com';

let pendingPaymentId = null;
let selectedMethod = 'mtn';
let isProcessing = false;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.payment-method').forEach(el => {
    el.addEventListener('click', function() {
      document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
      this.classList.add('selected');
      selectedMethod = this.dataset.method;
      updatePhonePlaceholder();
    });
  });

  const submitBtn = document.getElementById('submitPayment');
  if (submitBtn) submitBtn.addEventListener('click', handlePayment);
  
  const cancelBtn = document.getElementById('cancelPayment');
  if (cancelBtn) cancelBtn.addEventListener('click', closePayment);
  
  const overlay = document.getElementById('paymentModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === this) closePayment();
    });
  }
});

// ============================================================
//  HELPERS
// ============================================================
function updatePhonePlaceholder() {
  const input = document.getElementById('payPhone');
  const hint = document.getElementById('phoneHint');
  const prefix = document.getElementById('phonePrefix');
  
  if (selectedMethod === 'mtn') {
    input.placeholder = '01 51 00 00 00';
    hint.textContent = 'Exemple : 01 51 00 00 00 (10 chiffres)';
    prefix.textContent = '+229';
  } else if (selectedMethod === 'moov') {
    input.placeholder = '01 64 00 00 00';
    hint.textContent = 'Exemple : 01 64 00 00 00 (10 chiffres)';
    prefix.textContent = '+229';
  } else if (selectedMethod === 'celtiis') {
    input.placeholder = '01 43 00 00 00';
    hint.textContent = 'Exemple : 01 43 00 00 00 (10 chiffres)';
    prefix.textContent = '+229';
  }
}

function validatePhone(phone) {
  const clean = phone.replace(/\s/g, '');
  return /^01\d{8}$/.test(clean);
}

// ============================================================
//  OPEN / CLOSE PAYMENT
// ============================================================
function openPayment(id) {
  const storage = {
    get: (key) => {
      try { const val = localStorage.getItem(key); return val ? { value: val } : null; }
      catch (_) { return null; }
    }
  };

  try {
    const res = storage.get('gagne:ebooks');
    if (res && res.value) {
      const ebooks = JSON.parse(res.value);
      const ebook = ebooks.find(e => e.id === id);
      if (!ebook) { showToast('Guide introuvable'); return; }
      
      pendingPaymentId = id;
      document.getElementById('payTitle').textContent = ebook.title;
      document.getElementById('payTotal').textContent = fmtPrice(ebook.price);
      document.getElementById('payPhone').value = '';
      
      document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
      document.querySelector('.payment-method[data-method="mtn"]').classList.add('selected');
      selectedMethod = 'mtn';
      updatePhonePlaceholder();
      
      document.getElementById('paymentModalOverlay').classList.add('show');
      window._cartForPayment = null;
    }
  } catch(e) {
    showToast('Erreur: recharge la page');
    console.error(e);
  }
}

function closePayment() {
  document.getElementById('paymentModalOverlay').classList.remove('show');
  pendingPaymentId = null;
  window._cartForPayment = null;
  isProcessing = false;
}

// ============================================================
//  SAVE PURCHASED ITEMS
// ============================================================
function savePurchasedItems(items) {
  try {
    let existing = [];
    try {
      const data = localStorage.getItem('gagne:purchased');
      if (data) existing = JSON.parse(data);
    } catch(e) {}
    
    items.forEach(newItem => {
      if (!existing.find(e => e.id === newItem.id)) {
        existing.push({
          id: newItem.id,
          title: newItem.title,
          image: newItem.image,
          pages: newItem.pages,
          category: newItem.category,
          link: newItem.link || '',
          purchasedAt: Date.now()
        });
      }
    });
    
    localStorage.setItem('gagne:purchased', JSON.stringify(existing));
  } catch(e) {
    console.error('Erreur sauvegarde achats:', e);
  }
}

// ============================================================
//  HANDLE PAYMENT (Appel au backend)
// ============================================================
async function handlePayment() {
  if (isProcessing) return;
  
  const phoneInput = document.getElementById('payPhone');
  const phone = phoneInput.value.trim();
  
  if (!phone) {
    showToast('📱 Entrez votre numéro de téléphone');
    return;
  }
  
  if (!validatePhone(phone)) {
    showToast('📱 Numéro invalide (ex: 01 51 00 00 00)');
    return;
  }

  // Récupérer les articles
  let items = [];
  let total = 0;
  
  if (window._cartForPayment && window._cartForPayment.length > 0) {
    items = window._cartForPayment;
    total = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  } else if (pendingPaymentId) {
    const storage = {
      get: (key) => {
        try { const val = localStorage.getItem(key); return val ? { value: val } : null; }
        catch (_) { return null; }
      }
    };
    try {
      const res = storage.get('gagne:ebooks');
      if (res && res.value) {
        const ebooks = JSON.parse(res.value);
        const ebook = ebooks.find(e => e.id === pendingPaymentId);
        if (ebook) {
          items = [{ ...ebook, qty: 1 }];
          total = ebook.price;
        }
      }
    } catch(e) {
      showToast('Erreur: guide introuvable');
      return;
    }
  }

  if (items.length === 0) { showToast('Erreur: aucun article'); return; }

  const payBtn = document.getElementById('submitPayment');
  isProcessing = true;
  payBtn.disabled = true;
  payBtn.innerHTML = '⏳ Envoi...';

  try {
    // ============================================================
    //  APPEL AU BACKEND POUR CRÉER LA TRANSACTION
    // ============================================================
    const response = await fetch(`${BACKEND_URL}/api/paydunya/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items,
        phone: phone,
        method: selectedMethod
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Erreur lors de la création du paiement');
    }

    // Transaction créée avec succès
    payBtn.innerHTML = '📱 Confirme sur ton téléphone...';
    
    // Attendre la confirmation (simulation)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Succès
    savePurchasedItems(items);
    
    if (window._cartForPayment) {
      if (typeof cart !== 'undefined') {
        cart = [];
        saveCart();
        updateCartUI();
      }
    }
    
    payBtn.innerHTML = '✅ Payé !';
    payBtn.style.background = '#1F6E5C';
    payBtn.style.borderColor = '#1F6E5C';
    
    showToast(`✅ Paiement de ${fmtPrice(total)} confirmé !`);
    
    showProgressBar();
    
    setTimeout(() => {
      window.location.href = 'download.html';
    }, 2500);
    
  } catch (err) {
    showToast('❌ Erreur: ' + (err.message || 'Réessaie'));
    payBtn.disabled = false;
    payBtn.innerHTML = '🔒 Payer maintenant';
    payBtn.style.background = '';
    payBtn.style.borderColor = '';
    isProcessing = false;
  }
}

// ============================================================
//  BARRE DE PROGRESSION
// ============================================================
function showProgressBar() {
  const overlay = document.createElement('div');
  overlay.id = 'progressOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(21,22,31,0.85);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    z-index: 1000; padding: 20px;
  `;
  
  overlay.innerHTML = `
    <div style="background: var(--paper); padding: 40px; border-radius: 12px; max-width: 400px; width: 100%; text-align: center; border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard);">
      <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
      <h3 style="font-family: 'Fraunces', serif; font-size: 22px; margin-bottom: 4px;">Paiement effectué !</h3>
      <p style="color: var(--ink-soft); font-size: 14px; margin-bottom: 20px;">Redirection vers le téléchargement...</p>
      <div style="width: 100%; height: 4px; background: var(--line); border-radius: 2px; overflow: hidden;">
        <div id="progressBar" style="width: 0%; height: 100%; background: var(--gold); border-radius: 2px; transition: width 0.3s ease;"></div>
      </div>
      <p style="font-size: 12px; color: var(--ink-soft); margin-top: 10px;">Vos guides sont prêts</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 12 + 3;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
    }
    const bar = document.getElementById('progressBar');
    if (bar) bar.style.width = progress + '%';
  }, 150);
}

// ============================================================
//  TOAST
// ============================================================
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) { console.log('Toast:', msg); return; }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2800);
}

// ============================================================
//  EXPORT
// ============================================================
window.openPayment = openPayment;
window.closePayment = closePayment;
window.handlePayment = handlePayment;
window.savePurchasedItems = savePurchasedItems;