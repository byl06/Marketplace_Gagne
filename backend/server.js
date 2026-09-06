// ============================================================
//  SERVER.JS - Backend GAGNE (Sécurisé + MongoDB)
// ============================================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB, closeDB } = require('./db/mongodb');

// Charger les variables d'environnement
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
//  CONNEXION MONGODB
// ============================================================
connectDB().catch(console.error);

// ============================================================
//  MIDDLEWARES DE SÉCURITÉ
// ============================================================

// 1. Helmet : Sécurise les headers HTTP (CSP corrigé)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'", 
        "https://*.paydunya.com", 
        "https://*.googleapis.com", 
        "https://*.gstatic.com"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://*.googleapis.com", 
        "https://*.gstatic.com"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:", 
        "http:", 
        "https://*.unsplash.com", 
        "https://*.paydunya.com"
      ],
      fontSrc: [
        "'self'", 
        "https://*.gstatic.com", 
        "https://*.googleapis.com", 
        "data:"
      ],
      // ============================================================
      //  CORRECTION : AJOUT DE L'URL DU BACKEND
      // ============================================================
      connectSrc: [
        "'self'", 
        "https://*.paydunya.com", 
        "https://*.googleapis.com",
        "https://gagne-backend.onrender.com"
      ],
      frameSrc: ["'self'", "https://*.paydunya.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-site" },
  dnsPrefetchControl: true,
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: true,
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
}));

// 2. CORS : Autoriser uniquement les origines autorisées
const allowedOrigins = [
  'http://localhost:3001',
  'https://gagne.netlify.app',
  'https://gagne-guidestore.netlify.app',
  'https://gagne.bj',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Non autorisé par CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key']
}));

// 3. Rate Limiting : Limite les requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par fenêtre
  message: {
    error: 'Trop de requêtes, veuillez réessayer dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Appliquer le rate limiting à toutes les routes API
app.use('/api/', limiter);

// Rate limiting spécifique pour les paiements (plus strict)
// Rate limiting spécifique pour les paiements (plus strict)
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 100, // 100 tentatives par heure (au lieu de 5)
  message: {
    error: 'Trop de tentatives, veuillez réessayer dans 1 heure.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Pour les logs
app.set('trust proxy', false);
// ============================================================
//  LOGGING DE SÉCURITÉ
// ============================================================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ============================================================
//  ROUTES
// ============================================================

// Route de test (avec statut MongoDB)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Serveur GAGNE en ligne !',
    database: process.env.MONGODB_URI ? 'MongoDB connecté' : 'MongoDB non configuré',
    timestamp: new Date().toISOString()
  });
});

// Routes PayDunya (avec rate limiting spécifique)
const paydunyaRoutes = require('./routes/paydunya');
app.use('/api/paydunya', paymentLimiter, paydunyaRoutes);

// ============================================================
//  GESTION DES ERREURS
// ============================================================

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(500).json({ 
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================================
//  ARRÊT GRACIEUX
// ============================================================
process.on('SIGINT', async () => {
  console.log('🔄 Arrêt du serveur...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Arrêt du serveur...');
  await closeDB();
  process.exit(0);
});

// ============================================================
//  DÉMARRAGE
// ============================================================
app.listen(PORT, () => {
  console.log('========================================');
  console.log('🛡️  GAGNE Backend (Sécurisé + MongoDB)');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📡 IPN: http://localhost:${PORT}/api/paydunya/ipn`);
  console.log(`🔧 Mode: ${process.env.PAYDUNYA_MODE || 'sandbox'}`);
  console.log(`🗄️  Base de données: ${process.env.DB_NAME || 'gagne'}`);
  console.log(`🔒 Rate limiting: Actif`);
  console.log(`🛡️  Helmet: Actif`);
  console.log('========================================');
});

module.exports = app;