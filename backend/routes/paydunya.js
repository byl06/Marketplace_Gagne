// ============================================================
//  PAYDUNYA ROUTES - SDK OFFICIEL
// ============================================================

const express = require('express');
const router = express.Router();
const paydunya = require('paydunya');
const { getCollection } = require('../db/mongodb');

// ============================================================
//  CONFIGURATION PAYDUNYA - SDK OFFICIEL
// ============================================================
const setup = new paydunya.Setup({
  masterKey: process.env.PAYDUNYA_MASTER_KEY,
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
  token: process.env.PAYDUNYA_TOKEN,
  mode: process.env.PAYDUNYA_MODE || 'test'  // 'test' ou 'live'
});

// Configuration du magasin/boutique
const store = new paydunya.Store({
  name: 'GAGNE',
  tagline: 'Des guides qui rapportent',
  phoneNumber: '0151000000',
  websiteURL: process.env.CLIENT_URL || 'https://gagne-guidestore.netlify.app',
  logoURL: 'https://gagne-guidestore.netlify.app/assets/images/logo.png',
  returnURL: process.env.CLIENT_URL || 'https://gagne-guidestore.netlify.app',
  cancelURL: process.env.CLIENT_URL || 'https://gagne-guidestore.netlify.app/',
  callbackURL: 'https://gagne-backend.onrender.com/api/paydunya/ipn'
});

console.log('🔗 PayDunya SDK configuré');
console.log(`🔧 Mode: ${setup.mode || 'test'}`);

// ============================================================
//  ROUTE: Créer une transaction
// ============================================================
router.post('/create', async (req, res) => {
  try {
    const { items, phone, method, idempotencyKey } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Aucun article' });
    }

    // Calcul du total en FCFA
    const totalEuro = items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
    const totalFCFA = Math.round(totalEuro * 655.96);

    // Création de la facture
    const invoice = new paydunya.CheckoutInvoice(setup, store);

    // Ajout des articles
    items.forEach(item => {
      const priceFCFA = Math.round(item.price * 655.96);
      invoice.addItem(
        item.title,
        item.qty || 1,
        priceFCFA,
        priceFCFA * (item.qty || 1),
        item.description || ''
      );
    });

    // Montant total
    invoice.totalAmount = totalFCFA;

    // Description
    invoice.description = items.length > 1 
      ? `Achat de ${items.length} guides sur GAGNE` 
      : `Achat de "${items[0].title}"`;

    // Données personnalisées
    invoice.addCustomData('idempotencyKey', idempotencyKey);
    invoice.addCustomData('items', items);
    invoice.addCustomData('phone', phone);
    invoice.addCustomData('method', method);

    // Création de la facture
    await invoice.create();

    console.log('✅ Facture créée avec succès');
    console.log('📦 Token:', invoice.token);
    console.log('🔗 URL:', invoice.url);

    // Sauvegarder la transaction
    const transactionsCollection = await getCollection('transactions');
    await transactionsCollection.insertOne({
      idempotencyKey,
      transaction_id: invoice.token,
      status: 'pending',
      amount: totalFCFA,
      items,
      phone,
      method,
      url: invoice.url,
      createdAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      token: invoice.token,
      url: invoice.url,
      invoice: invoice
    });

  } catch (error) {
    console.error('❌ Erreur PayDunya:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erreur serveur'
    });
  }
});

// ============================================================
//  ROUTE: IPN (Callback)
// ============================================================
router.post('/ipn', async (req, res) => {
  console.log('🔄 IPN reçu');
  console.log('📦 Body:', req.body);

  try {
    // Récupérer les données de l'IPN
    const data = req.body.data;

    if (!data) {
      console.log('❌ Aucune donnée IPN');
      return res.status(200).json({ success: false });
    }

    const status = data.status;
    const invoiceData = data.invoice;
    const customData = data.custom_data;
    const customer = data.customer;

    console.log(`📊 Statut: ${status}`);
    console.log(`📦 Token: ${invoiceData?.token}`);
    console.log(`👤 Client: ${customer?.name || 'Inconnu'}`);

    if (status === 'completed') {
      console.log('✅ Paiement confirmé !');

      // Sauvegarder la commande
      const ordersCollection = await getCollection('orders');
      await ordersCollection.insertOne({
        transaction_id: invoiceData?.token,
        status: 'completed',
        amount: invoiceData?.total_amount,
        items: customData?.items || [],
        phone: customData?.phone,
        method: customData?.method,
        customer: customer,
        receipt_url: data.receipt_url,
        date: new Date().toISOString()
      });

      // Mettre à jour la transaction
      const transactionsCollection = await getCollection('transactions');
      if (customData?.idempotencyKey) {
        await transactionsCollection.updateOne(
          { idempotencyKey: customData.idempotencyKey },
          { $set: { 
            status: 'completed', 
            transaction_id: invoiceData?.token,
            completedAt: new Date().toISOString()
          }}
        );
      }

      return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Erreur IPN:', error);
    return res.status(200).json({ success: false });
  }
});

// ============================================================
//  ROUTE: Vérifier le statut d'une transaction
// ============================================================
router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const invoice = new paydunya.CheckoutInvoice(setup, store);
    await invoice.confirm(token);

    return res.json({
      status: invoice.status,
      customer: invoice.customer,
      receiptURL: invoice.receiptURL,
      responseText: invoice.responseText
    });

  } catch (error) {
    console.error('❌ Erreur statut:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
//  ROUTES: Ebooks (CRUD)
// ============================================================

// GET : Récupérer tous les ebooks
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

// POST : Ajouter ou modifier un ebook
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

// DELETE : Supprimer un ebook
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