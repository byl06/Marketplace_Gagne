// ============================================================
//  PAYDUNYA ROUTES - Gestion des paiements (MongoDB)
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getCollection } = require('../db/mongodb');
const { ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

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

const PAYDUNYA_URL = PAYDUNYA_CONFIG.mode === 'live'
  ? 'https://paydunya.com/api/v1'
  : 'https://sandbox.paydunya.com/api/v1';

const CURRENCY_RATE = 655.96;

function convertToFCFA(euro) {
  return Math.round(euro * CURRENCY_RATE);
}

// ============================================================
//  ROUTES EBOOKS (CRUD avec MongoDB)
// ============================================================

// GET : Récupérer tous les ebooks
router.get('/ebooks', async (req, res) => {
  try {
    const collection = await getCollection('ebooks');
    const ebooks = await collection.find().sort({ createdAt: -1 }).toArray();
    res.json({ ebooks });
  } catch (error) {
    console.error('❌ Erreur récupération ebooks:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST : Ajouter ou modifier un ebook
router.post('/ebooks', async (req, res) => {
  try {
    const { ebook } = req.body;
    if (!ebook) {
      return res.status(400).json({ error: 'Ebook requis' });
    }

    const collection = await getCollection('ebooks');

    if (ebook.id) {
      // Modifier un ebook existant
      const result = await collection.updateOne(
        { id: ebook.id },
        { $set: { ...ebook, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      return res.json({ success: true, ebook, modified: result.modifiedCount });
    } else {
      // Nouvel ebook
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
    console.error('❌ Erreur sauvegarde ebook:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE : Supprimer un ebook
router.delete('/ebooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const collection = await getCollection('ebooks');
    const result = await collection.deleteOne({ id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Ebook non trouvé' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erreur suppression ebook:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
//  ROUTE: Créer une transaction
// ============================================================
router.post('/create', async (req, res) => {
  try {
    const { items, phone, method, idempotencyKey } = req.body;

    // ============================================================
    //  1. VALIDATION DES DONNÉES
    // ============================================================

    // Vérifier l'idempotence
    if (!idempotencyKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Clé d\'idempotence requise' 
      });
    }

    // Vérifier si la transaction existe déjà
    const transactionsCollection = await getCollection('transactions');
    const existing = await transactionsCollection.findOne({ idempotencyKey });
    if (existing) {
      console.log(`🔄 Transaction déjà traitée: ${idempotencyKey}`);
      return res.status(409).json({
        success: false,
        error: 'Transaction déjà traitée',
        existing
      });
    }

    // Validation des articles
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Aucun article valide' 
      });
    }

    // Validation du téléphone
    if (!phone || !/^01\d{8}$/.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ 
        success: false, 
        error: 'Numéro de téléphone invalide' 
      });
    }

    // Validation de la méthode
    const validMethods = ['mtn', 'moov', 'celtiis'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Méthode de paiement invalide' 
      });
    }

    // Validation des prix
    for (const item of items) {
      if (typeof item.price !== 'number' || item.price <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Prix invalide pour un article' 
        });
      }
    }

    // ============================================================
    //  2. CALCUL DU TOTAL
    // ============================================================
    const totalEuro = items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    const totalFCFA = convertToFCFA(totalEuro);

    if (totalFCFA <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Montant invalide' 
      });
    }

    // ============================================================
    //  3. MAPPING DES MÉTHODES PAYDUNYA
    // ============================================================
    const methodMap = {
      'mtn': 'MTN_MONEY',
      'moov': 'MOOV_MONEY',
      'celtiis': 'CELTIIS'
    };

    // ============================================================
    //  4. CONSTRUCTION DU PAYLOAD
    // ============================================================
    const payload = {
      amount: totalFCFA,
      currency: 'XOF',
      description: items.length > 1 
        ? `Achat de ${items.length} guides sur GAGNE` 
        : `Achat de "${items[0].title}"`,
      callback_url: process.env.CLIENT_URL || 'https://gagne.netlify.app',
      cancel_url: process.env.CLIENT_URL || 'https://gagne.netlify.app',
      payment_method: methodMap[method] || 'MTN_MONEY',
      custom_data: {
        idempotencyKey: idempotencyKey,
        items: items.map(i => ({ 
          id: i.id, 
          title: i.title, 
          qty: i.qty || 1,
          price: i.price
        })),
        phone: phone,
        method: method
      }
    };

    console.log('📦 Envoi à PayDunya:', JSON.stringify(payload, null, 2));

    // ============================================================
    //  5. APPEL À L'API PAYDUNYA
    // ============================================================
    const response = await axios.post(`${PAYDUNYA_URL}/checkout-invoice/create`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
        'PAYDUNYA-PUBLIC-KEY': PAYDUNYA_CONFIG.publicKey,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
        'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
      },
      timeout: 30000 // 30 secondes
    });

    console.log('📦 Réponse PayDunya:', response.data);

    // ============================================================
    //  6. TRAITEMENT DE LA RÉPONSE
    // ============================================================
    if (response.data && response.data.response_code === '00') {
      // Sauvegarder la transaction dans MongoDB
      await transactionsCollection.insertOne({
        idempotencyKey,
        transaction_id: response.data.token,
        status: 'pending',
        amount: totalFCFA,
        items: items,
        phone: phone,
        method: method,
        createdAt: new Date().toISOString()
      });

      return res.json({
        success: true,
        invoice: response.data,
        token: response.data.token,
        transaction_id: response.data.token
      });
    } else {
      // Sauvegarder l'échec
      await transactionsCollection.insertOne({
        idempotencyKey,
        status: 'failed',
        error: response.data.response_text || 'Erreur inconnue',
        amount: totalFCFA,
        createdAt: new Date().toISOString()
      });

      return res.status(400).json({
        success: false,
        error: response.data.response_text || 'Erreur lors de la création',
        details: response.data
      });
    }

  } catch (error) {
    console.error('❌ Erreur PayDunya:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
      details: error.response?.data || error.message
    });
  }
});

// ============================================================
//  ROUTE: IPN - Instant Payment Notification
//  URL: https://gagne-backend.onrender.com/api/paydunya/ipn
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);
  console.log('📋 Headers:', req.headers);

  try {
    const { status, transaction_id, custom_data, amount, token } = req.body;

    // ============================================================
    //  VÉRIFICATION CÔTÉ SERVEUR
    // ============================================================
    if (status === 'completed') {
      console.log(`✅ Paiement confirmé - Transaction: ${transaction_id}`);
      console.log(`📦 Articles: ${JSON.stringify(custom_data?.items)}`);
      console.log(`📱 Téléphone: ${custom_data?.phone}`);
      console.log(`💰 Montant: ${amount} FCFA`);

      // ============================================================
      //  VÉRIFIER LA TRANSACTION SUR PAYDUNYA
      // ============================================================
      try {
        const verifyResponse = await axios.get(`${PAYDUNYA_URL}/checkout-invoice/status/${token || transaction_id}`, {
          headers: {
            'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
            'PAYDUNYA-PUBLIC-KEY': PAYDUNYA_CONFIG.publicKey,
            'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
            'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
          }
        });

        console.log('✅ Vérification PayDunya:', verifyResponse.data);
        
        if (verifyResponse.data && verifyResponse.data.response_code !== '00') {
          console.warn('⚠️ Transaction non vérifiée par PayDunya');
          return res.status(200).json({ 
            success: false, 
            error: 'Transaction non vérifiée' 
          });
        }
      } catch (verifyError) {
        console.error('❌ Erreur vérification:', verifyError);
        // Continuer malgré l'erreur de vérification
      }

      // ============================================================
      //  SAUVEGARDE DE LA COMMANDE DANS MONGODB
      // ============================================================
      const ordersCollection = await getCollection('orders');
      await ordersCollection.insertOne({
        transaction_id,
        token: token || transaction_id,
        items: custom_data?.items || [],
        phone: custom_data?.phone,
        method: custom_data?.method,
        amount: amount,
        idempotencyKey: custom_data?.idempotencyKey,
        status: 'completed',
        date: new Date().toISOString()
      });

      // ============================================================
      //  METTRE À JOUR LA TRANSACTION
      // ============================================================
      const transactionsCollection = await getCollection('transactions');
      if (custom_data?.idempotencyKey) {
        await transactionsCollection.updateOne(
          { idempotencyKey: custom_data.idempotencyKey },
          { $set: { 
            status: 'completed', 
            transaction_id: transaction_id,
            completedAt: new Date().toISOString()
          }}
        );
      }

      return res.status(200).json({ 
        success: true, 
        message: 'IPN reçu et traité' 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'IPN reçu mais non traité' 
    });

  } catch (error) {
    console.error('❌ Erreur IPN:', error);
    return res.status(200).json({ 
      success: false, 
      error: 'Erreur de traitement' 
    });
  }
});

// ============================================================
//  ROUTE: Vérifier le statut d'une transaction
// ============================================================
router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const response = await axios.get(`${PAYDUNYA_URL}/checkout-invoice/status/${token}`, {
      headers: {
        'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
        'PAYDUNYA-PUBLIC-KEY': PAYDUNYA_CONFIG.publicKey,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
        'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
      }
    });

    return res.json(response.data);

  } catch (error) {
    console.error('Erreur status:', error);
    return res.status(500).json({ 
      error: 'Erreur lors de la vérification' 
    });
  }
});

// ============================================================
//  ROUTE: Récupérer les commandes (Admin)
// ============================================================
router.get('/orders', async (req, res) => {
  try {
    const ordersCollection = await getCollection('orders');
    const orders = await ordersCollection.find().sort({ date: -1 }).limit(100).toArray();
    return res.json({ orders });
  } catch (error) {
    console.error('❌ Erreur récupération commandes:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;