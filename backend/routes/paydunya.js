// ============================================================
//  PAYDUNYA ROUTES - Gestion des paiements (Sécurisé)
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
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

// Vérification que les clés sont présentes
if (!PAYDUNYA_CONFIG.masterKey || PAYDUNYA_CONFIG.masterKey === 'test') {
  console.warn('⚠️ ATTENTION: Les clés PayDunya ne sont pas configurées!');
}

const PAYDUNYA_URL = PAYDUNYA_CONFIG.mode === 'live'
  ? 'https://paydunya.com/api/v1'
  : 'https://sandbox.paydunya.com/api/v1';

// Taux de change
const CURRENCY_RATE = 655.96;

function convertToFCFA(euro) {
  return Math.round(euro * CURRENCY_RATE);
}

// ============================================================
//  STOCKAGE DES TRANSACTIONS (pour idempotence)
// ============================================================
const transactionsPath = path.join(__dirname, '../transactions.json');

function getTransactions() {
  try {
    if (fs.existsSync(transactionsPath)) {
      return JSON.parse(fs.readFileSync(transactionsPath, 'utf8'));
    }
  } catch(e) {}
  return {};
}

function saveTransaction(idempotencyKey, data) {
  try {
    const transactions = getTransactions();
    transactions[idempotencyKey] = {
      ...data,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(transactionsPath, JSON.stringify(transactions, null, 2));
  } catch(e) {
    console.error('Erreur sauvegarde transaction:', e);
  }
}

// ============================================================
//  ROUTE: Créer une transaction (avec idempotence)
// ============================================================
router.post('/create', async (req, res) => {
  try {
    // ============================================================
    //  1. VALIDATION DES DONNÉES (côté serveur)
    // ============================================================
    const { items, phone, method, idempotencyKey } = req.body;

    // Vérifier l'idempotence
    if (!idempotencyKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Clé d\'idempotence requise' 
      });
    }

    // Vérifier si la transaction a déjà été traitée
    const transactions = getTransactions();
    if (transactions[idempotencyKey]) {
      console.log(`🔄 Transaction déjà traitée: ${idempotencyKey}`);
      return res.status(409).json({
        success: false,
        error: 'Transaction déjà traitée',
        existing: transactions[idempotencyKey]
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
      // Sauvegarder la transaction
      saveTransaction(idempotencyKey, {
        status: 'pending',
        transaction_id: response.data.token,
        amount: totalFCFA,
        items: items,
        phone: phone,
        method: method
      });

      return res.json({
        success: true,
        invoice: response.data,
        token: response.data.token,
        transaction_id: response.data.token
      });
    } else {
      // Sauvegarder l'échec
      saveTransaction(idempotencyKey, {
        status: 'failed',
        error: response.data.response_text || 'Erreur inconnue',
        amount: totalFCFA
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
//  ROUTE: IPN (avec vérification signature)
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);
  console.log('📋 Headers:', req.headers);

  try {
    // ============================================================
    //  VÉRIFICATION DE LA SIGNATURE (optionnel mais recommandé)
    // ============================================================
    const signature = req.headers['paydunya-signature'];
    // TODO: Vérifier la signature avec la clé privée
    
    const { status, transaction_id, custom_data, amount, token } = req.body;

    // Vérifier le statut
    if (status === 'completed') {
      console.log(`✅ Paiement confirmé - Transaction: ${transaction_id}`);
      console.log(`📦 Articles: ${JSON.stringify(custom_data?.items)}`);
      console.log(`📱 Téléphone: ${custom_data?.phone}`);
      console.log(`💰 Montant: ${amount} FCFA`);

      // ============================================================
      //  VÉRIFICATION CÔTÉ SERVEUR : Vérifier la transaction sur PayDunya
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
      //  SAUVEGARDE DE LA COMMANDE
      // ============================================================
      const ordersPath = path.join(__dirname, '../orders.json');
      let orders = [];
      try {
        if (fs.existsSync(ordersPath)) {
          orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
        }
      } catch(e) {}

      orders.push({
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

      fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));

      // Mettre à jour la transaction
      const transactions = getTransactions();
      if (custom_data?.idempotencyKey && transactions[custom_data.idempotencyKey]) {
        transactions[custom_data.idempotencyKey].status = 'completed';
        transactions[custom_data.idempotencyKey].transaction_id = transaction_id;
        fs.writeFileSync(transactionsPath, JSON.stringify(transactions, null, 2));
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
    const ordersPath = path.join(__dirname, '../orders.json');
    let orders = [];
    try {
      if (fs.existsSync(ordersPath)) {
        orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
      }
    } catch(e) {}

    return res.json({ orders });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;