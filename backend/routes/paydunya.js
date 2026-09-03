// ============================================================
//  PAYDUNYA ROUTES - Gestion des paiements
// ============================================================

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');

// Configuration PayDunya (avec fallback sur les clés d'exemple)
const PAYDUNYA_CONFIG = {
  masterKey: process.env.PAYDUNYA_MASTER_KEY || 'test_master_key',
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY || 'test_public_key',
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY || 'test_private_key',
  token: process.env.PAYDUNYA_TOKEN || 'test_token',
  mode: process.env.PAYDUNYA_MODE || 'sandbox'
};

// URL de base PayDunya
const PAYDUNYA_URL = PAYDUNYA_CONFIG.mode === 'live' 
  ? 'https://paydunya.com/api/v1' 
  : 'https://sandbox.paydunya.com/api/v1';

// Taux de change FCFA / EUR
const CURRENCY_RATE = 655.96;

function convertToFCFA(euro) {
  return Math.round(euro * CURRENCY_RATE);
}

// ============================================================
//  ROUTE: Créer une transaction
// ============================================================
router.post('/create', async (req, res) => {
  try {
    const { items, phone, method } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Aucun article' });
    }

    // Calcul du total en FCFA
    const totalEuro = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalFCFA = convertToFCFA(totalEuro);

    // Construction du payload pour PayDunya
    const payload = {
      amount: totalFCFA,
      currency: 'XOF',
      description: items.length > 1 
        ? `Achat de ${items.length} guides sur GAGNE` 
        : `Achat de "${items[0].title}"`,
      callback_url: `${process.env.CLIENT_URL || 'http://localhost:3001'}/payment-success`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3001'}/payment-cancel`,
      custom_data: {
        items: items.map(i => ({ 
          id: i.id, 
          title: i.title, 
          qty: i.qty,
          price: i.price
        })),
        phone: phone,
        method: method
      },
      invoice_data: {
        phone: phone,
        method: method
      }
    };

    // Ajout du moyen de paiement
    const methodMap = {
      'mtn': 'MTN_MONEY',
      'moov': 'MOOV_MONEY',
      'celtiis': 'CELTIIS'
    };

    if (methodMap[method]) {
      payload.payment_method = methodMap[method];
    }

    // Envoi à l'API PayDunya
    const response = await axios.post(`${PAYDUNYA_URL}/checkout-invoice/create`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': PAYDUNYA_CONFIG.masterKey,
        'PAYDUNYA-PUBLIC-KEY': PAYDUNYA_CONFIG.publicKey,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_CONFIG.privateKey,
        'PAYDUNYA-TOKEN': PAYDUNYA_CONFIG.token
      }
    });

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
        error: response.data.response_text || 'Erreur lors de la création',
        details: response.data
      });
    }

  } catch (error) {
    console.error('Erreur PayDunya:', error.response?.data || error.message);
    return res.status(500).json({
      error: 'Erreur serveur',
      details: error.response?.data || error.message
    });
  }
});

// ============================================================
//  ROUTE: IPN - Instant Payment Notification (Endpoint PayDunya)
//  URL: https://tonsite.com/api/paydunya/ipn
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);
  console.log('📋 Headers:', req.headers);

  try {
    // Vérifier la signature de PayDunya (sécurité)
    const signature = req.headers['paydunya-signature'];
    const payload = JSON.stringify(req.body);

    // Optionnel : Vérifier la signature avec ta clé privée
    // const expectedSignature = crypto
    //   .createHmac('sha256', PAYDUNYA_CONFIG.privateKey)
    //   .update(payload)
    //   .digest('hex');

    // if (signature !== expectedSignature) {
    //   console.warn('⚠️ Signature invalide !');
    //   return res.status(403).json({ error: 'Signature invalide' });
    // }

    const { status, transaction_id, custom_data, amount } = req.body;

    if (status === 'completed') {
      // Paiement confirmé par PayDunya
      console.log(`✅ Paiement confirmé - Transaction: ${transaction_id}`);
      console.log(`📦 Articles: ${JSON.stringify(custom_data?.items)}`);
      console.log(`📱 Téléphone: ${custom_data?.phone}`);
      console.log(`💰 Montant: ${amount} FCFA`);

      // ICI : Sauvegarder la commande dans ta base de données
      // Exemple : sauvegarder dans un fichier JSON ou une base de données
      const fs = require('fs');
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

      // Répondre à PayDunya pour confirmer la réception
      return res.status(200).json({ 
        success: true, 
        message: 'IPN reçu et traité' 
      });

    } else {
      console.log(`⚠️ Paiement non confirmé (status: ${status})`);
      return res.status(200).json({ 
        success: true, 
        message: 'IPN reçu mais pas traité' 
      });
    }

  } catch (error) {
    console.error('❌ Erreur IPN:', error);
    // Toujours répondre 200 pour que PayDunya ne renvoie pas le webhook
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
    const fs = require('fs');
    const path = require('path');
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