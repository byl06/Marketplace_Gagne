const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PAYDUNYA_CONFIG = {
  masterKey: process.env.PAYDUNYA_MASTER_KEY || 'test',
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY || 'test',
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY || 'test',
  token: process.env.PAYDUNYA_TOKEN || 'test',
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
//  ROUTE : Créer une transaction
// ============================================================
router.post('/create', async (req, res) => {
  try {
    const { items, phone, method } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Aucun article' });
    }

    const totalEuro = items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalFCFA = convertToFCFA(totalEuro);

    const payload = {
      amount: totalFCFA,
      currency: 'XOF',
      description: items.length > 1
        ? `Achat de ${items.length} guides sur GAGNE`
        : `Achat de "${items[0].title}"`,
      callback_url: process.env.CLIENT_URL || 'http://localhost:3001',
      cancel_url: process.env.CLIENT_URL || 'http://localhost:3001',
      custom_data: {
        items: items.map(i => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })),
        phone: phone,
        method: method
      }
    };

    console.log('📦 Envoi à PayDunya:', JSON.stringify(payload, null, 2));

    // Simulation pour le moment (remplacer par PayDunya plus tard)
    return res.json({
      success: true,
      message: 'Transaction créée en mode simulation',
      transaction_id: 'sim_' + Date.now()
    });

  } catch (error) {
    console.error('❌ Erreur:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
//  ROUTE : IPN - Instant Payment Notification
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);

  try {
    const { status, transaction_id, custom_data } = req.body;

    if (status === 'completed') {
      console.log(`✅ Paiement confirmé - Transaction: ${transaction_id}`);

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
        status: 'completed',
        date: new Date().toISOString()
      });

      fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));

      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Erreur IPN:', error);
    return res.status(200).json({ success: false });
  }
});

// ============================================================
//  ROUTE : Vérifier le statut
// ============================================================
router.get('/status/:token', async (req, res) => {
  res.json({ status: 'pending', message: 'Simulation' });
});

module.exports = router;