const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================================
//  CONFIGURATION PAYDUNYA (depuis les variables d'environnement)
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

// Taux de change
const CURRENCY_RATE = 655.96;

function convertToFCFA(euro) {
  return Math.round(euro * CURRENCY_RATE);
}

// ============================================================
//  ROUTE : Créer une transaction (VRAI APPEL PAYDUNYA)
// ============================================================
router.post('/create', async (req, res) => {
  try {
    const { items, phone, method } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Aucun article' });
    }

    const totalEuro = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalFCFA = convertToFCFA(totalEuro);

    // Construction du payload pour PayDunya
    const payload = {
      amount: totalFCFA,
      currency: 'XOF',
      description: items.length > 1 
        ? `Achat de ${items.length} guides sur GAGNE` 
        : `Achat de "${items[0].title}"`,
      callback_url: process.env.CLIENT_URL || 'https://gagne.netlify.app',
      cancel_url: process.env.CLIENT_URL || 'https://gagne.netlify.app',
      custom_data: {
        items: items.map(i => ({ 
          id: i.id, 
          title: i.title, 
          qty: i.qty,
          price: i.price
        })),
        phone: phone,
        method: method
      }
    };

    console.log('📦 Envoi à PayDunya:', JSON.stringify(payload, null, 2));

    // ============================================================
    //  APPEL À L'API PAYDUNYA (le vrai, pas la simulation)
    // ============================================================
    const response = await axios.post(`${PAYDUNYA_URL}/checkout-invoice/create`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
        'PAYDUNYA-PUBLIC-KEY': PAYDUNYA_CONFIG.publicKey,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
        'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
      }
    });

    console.log('📦 Réponse PayDunya:', response.data);

    // Vérifier la réponse
    if (response.data && response.data.response_code === '00') {
      // Transaction créée avec succès
      return res.json({
        success: true,
        invoice: response.data,
        token: response.data.token
      });
    } else {
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
//  ROUTE : IPN - Instant Payment Notification
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);

  try {
    const { status, transaction_id, custom_data, amount } = req.body;

    if (status === 'completed') {
      console.log(`✅ Paiement confirmé - Transaction: ${transaction_id}`);
      console.log(`📦 Articles: ${JSON.stringify(custom_data?.items)}`);
      console.log(`📱 Téléphone: ${custom_data?.phone}`);
      console.log(`💰 Montant: ${amount} FCFA`);

      // Sauvegarder la commande
      const ordersPath = path.join(__dirname, '../orders.json');
      let orders = [];
      try {
        if (fs.existsSync(ordersPath)) {
          orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
        }
      } catch(e) {}

      orders.push({
        transaction_id,
        items: custom_data?.items || [],
        phone: custom_data?.phone,
        method: custom_data?.method,
        amount: amount,
        status: 'completed',
        date: new Date().toISOString()
      });

      fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));

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
//  ROUTE : Vérifier le statut d'une transaction
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
//  ROUTE : Récupérer les commandes (Admin)
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