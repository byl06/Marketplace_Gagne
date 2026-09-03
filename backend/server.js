// ============================================================
//  SERVER.JS - Backend GAGNE
// ============================================================

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  MIDDLEWARES
// ============================================================
app.use(cors({
  origin: ['http://localhost:3001', 'https://gagne.netlify.app', 'https://gagne.bj'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
//  ROUTES
// ============================================================

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Serveur GAGNE en ligne !' });
});

// Routes PayDunya
const paydunyaRoutes = require('./routes/paydunya');
app.use('/api/paydunya', paydunyaRoutes);

// ============================================================
//  DÉMARRAGE DU SERVEUR
// ============================================================
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🚀 GAGNE Backend démarré');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📡 IPN Endpoint: http://localhost:${PORT}/api/paydunya/ipn`);
  console.log(`🔧 Mode: ${process.env.PAYDUNYA_MODE || 'sandbox'}`);
  console.log('========================================');
});