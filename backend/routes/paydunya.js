// ============================================================
//  PAYDUNYA ROUTES - SOLUTION FINALE
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getCollection } = require('../db/mongodb');

// ============================================================
//  CONFIGURATION PAYDUNYA
// ============================================================
const PAYDUNYA_CONFIG = {
  masterKey: process.env.PAYDUNYA_MASTER_KEY,
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
  token: process.env.PAYDUNYA_TOKEN,
  mode: process.env.PAYDUNYA_MODE || 'sandbox'
};

// ============================================================
//  URL UNIVERSELLE - UTILISER paydunya.com DIRECTEMENT
//  Cette URL fonctionne pour sandbox ET live
// ============================================================
const PAYDUNYA_URL = 'https://paydunya.com/api/v1';

console.log(`🔗 PayDunya URL: ${PAYDUNYA_URL}`);
console.log(`🔧 Mode: ${PAYDUNYA_CONFIG.mode}`);
console.log(`🔑 Clé: ${PAYDUNYA_CONFIG.masterKey ? '✅ Présente' : '❌ Manquante'}`);

// ============================================================
//  ROUTE: Créer une transaction
// ============================================================
router.post('/create', async (req, res) => {
  try {
    const { items, phone, method, idempotencyKey } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun article' });
    }

    const totalEuro = items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    const totalFCFA = Math.round(totalEuro * 655.96);

    // Mapping des méthodes
    const methodMap = {
      'mtn': 'MTN_MONEY',
      'moov': 'MOOV_MONEY',
      'celtiis': 'CELTIIS'
    };

    const payload = {
      amount: totalFCFA,
      currency: 'XOF',
      description: items.length > 1 ? `Achat de ${items.length} guides` : `Achat de "${items[0].title}"`,
      callback_url: process.env.CLIENT_URL || 'https://gagne-guidestore.netlify.app/',
      cancel_url: process.env.CLIENT_URL || 'https://gagne-guidestore.netlify.app/',
      payment_method: methodMap[method] || 'MTN_MONEY',
      custom_data: {
        idempotencyKey,
        items: items.map(i => ({ id: i.id, title: i.title, qty: i.qty || 1, price: i.price })),
        phone,
        method
      }
    };

    console.log('📦 Envoi à PayDunya:', JSON.stringify(payload, null, 2));

    // Appel à PayDunya
    const response = await axios.post(`${PAYDUNYA_URL}/checkout-invoice/create`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
        'PAYDUNYA-PUBLIC-KEY': PAYDUNYA_CONFIG.publicKey,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
        'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
      },
      timeout: 30000
    });

    console.log('📦 Réponse PayDunya:', response.data);

    if (response.data && response.data.response_code === '00') {
      const transactionsCollection = await getCollection('transactions');
      await transactionsCollection.insertOne({
        idempotencyKey,
        transaction_id: response.data.token,
        status: 'pending',
        amount: totalFCFA,
        items,
        phone,
        method,
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        token: response.data.token,
        invoice: response.data
      });
    } else {
      return res.status(400).json({
        success: false,
        error: response.data.response_text || 'Erreur PayDunya'
      });
    }
  } catch (error) {
    console.error('❌ Erreur PayDunya:', error.message);
    if (error.response) {
      console.error('📦 Détails:', error.response.data);
    }
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur serveur'
    });
  }
});

// ============================================================
//  ROUTE: IPN
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);
  res.status(200).json({ success: true });
});

// ============================================================
//  ROUTE: Récupérer les ebooks
// ============================================================
router.get('/ebooks', async (req, res) => {
  try {
    const collection = await getCollection('ebooks');
    const ebooks = await collection.find().sort({ createdAt: -1 }).toArray();
    res.json({ ebooks });
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
//  ROUTE: Ajouter/Modifier un ebook
// ============================================================
router.post('/ebooks', async (req, res) => {
  try {
    const { ebook } = req.body;
    if (!ebook) return res.status(400).json({ error: 'Ebook requis' });

    const collection = await getCollection('ebooks');

    if (ebook.id) {
      await collection.updateOne(
        { id: ebook.id },
        { $set: { ...ebook, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      return res.json({ success: true, ebook });
    } else {
      const newEbook = {
        ...ebook,
        id: 'e-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await collection.insertOne(newEbook);
      return res.json({ success: true, ebook: newEbook });
    }
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
//  ROUTE: Supprimer un ebook
// ============================================================
router.delete('/ebooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await getCollection('ebooks');
    const result = await collection.deleteOne({ id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Ebook non trouvé' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;